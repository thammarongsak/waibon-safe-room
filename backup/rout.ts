import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/line/verify";
import { loadLineChannelByDestination } from "@/lib/channels/load";
import { loadAgent } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";
import { logAgentEvent } from "@/lib/agents/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------- helper: normalize model → string ---------- */
function modelToString(model: any): string {
  if (typeof model === "string") return model;
  return model?.model_key ?? model?.name ?? model?.id ?? "unknown";
}

function getCaps(agent: any): any {
  return agent?.effective_capabilities ?? agent?.capabilities ?? agent?.caps ?? {};
}

/* ---------- helper: safely get LINE access token ---------- */
function getChannelAccessToken(ch: any): string {
  const t =
    ch?.access_token ??
    ch?.token ??
    ch?.channel_access_token ??
    ch?.accessToken ??
    ch?.channelAccessToken;
  if (!t) throw new Error("Missing LINE access token on channel config");
  return String(t);
}

/* ---------- helper: safe numeric extraction from any result ---------- */
function num(obj: any, key: string): number | null {
  try {
    const v = obj?.[key];
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

/* ---------- [C] Router: destination → agent (allowlist) ---------- */
const DEST_AGENT_ALLOWLIST: Record<string, "Waibon" | "Waibe" | "Zeta"> = {
  //"U688db4b83e6cb70f4f5e5d121a8a07db": "Waibon", // พ่อ (อย่าใช้เป็น destination)
  "Uc88286f48b993140940a064f70952fb5": "Waibon",
  "U9384a9f7e13ae3a6dcdee5fe2656aafb": "Waibe",
  "Ucc5ab43be188b5d32132ce3236edf442": "Zeta",
};

/* ---------- [D] Trigger ไทย/อังกฤษ ---------- */
const TRIGGERS: Array<{ name: "Waibon" | "Waibe" | "Zeta"; re: RegExp; stripWith: string }> = [
  { name: "Waibon", re: /^(waibon|ไวบอน)\s*:?\s*/i, stripWith: "(?:waibon|ไวบอน)" },
  { name: "Waibe",  re: /^(waibe|ไวบิ)\s*:?\s*/i,   stripWith: "(?:waibe|ไวบิ)" },
  { name: "Zeta",   re: /^(zeta|ซีต้า)\s*:?\s*/i,  stripWith: "(?:zeta|ซีต้า)" },
];

const SAFE_LOG = (o: any) => { try { console.log(JSON.stringify(o)); } catch { console.log(o); } };

/* ---------- LINE reply helper (ใช้ access token ของ channel ปัจจุบัน) ---------- */
async function lineReply(accessToken: string, replyToken: string, messages: any[]) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) throw new Error(`LINE reply ${res.status}: ${await res.text()}`);
}

export async function POST(req: Request) {
  const raw = await req.text();

  let body: any;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }

  const dest = body?.destination || "";
  if (!dest) return NextResponse.json({ ok: false, error: "missing destination" }, { status: 400 });

  // 1) load channel
  const ch: any = await loadLineChannelByDestination(dest);
  if (!ch) return NextResponse.json({ ok: false, error: "unknown_channel" }, { status: 200 });

  // 2) verify signature (allow skip for test)
  const SKIP_SIGNATURE = process.env.LINE_SKIP_SIGNATURE === "1";
  const sig = (req.headers as any).get?.("x-line-signature") || (req as any).headers?.get?.("x-line-signature");
  if (!SKIP_SIGNATURE && !verifySignature(ch.secret, raw, sig)) {
    SAFE_LOG({ warn: "invalid_signature", dest });
    return NextResponse.json({ ok: false, warn: "invalid_signature" }, { status: 200 });
  }

  // 3) routing by destination → agent
  const mapped = DEST_AGENT_ALLOWLIST[dest];
  const defaultAgentName = (ch.agent_name as "Waibon" | "Waibe" | "Zeta") || "Waibon";
  let targetAgentName: "Waibon" | "Waibe" | "Zeta" = mapped || defaultAgentName;
  let agent = await loadAgent(ch.owner_id, targetAgentName);

  // 4) events
  for (const ev of body.events ?? []) {
    if (ev.type !== "message" || ev.message?.type !== "text") continue;

    const userId = ev?.source?.userId || null;
    let text: string = String(ev.message.text ?? "").trim();
    const token = getChannelAccessToken(ch);

    // ===== [เพิ่ม] คำสั่งกลุ่ม Hive (ไม่แตะลอจิกเดิม) =====
    const sourceType = ev?.source?.type;             // 'user' | 'group' | 'room'
    const groupId = ev?.source?.groupId as string|undefined;
    const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/,"");

    if (sourceType === "group" && groupId && text.startsWith("!hive")) {
      try {
        if (/^!hive\s+start/i.test(text)) {
          const resp = await fetch(`${BASE_URL}/api/hive/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ groupId, rounds: 3 })
          }).then(r => r.json());

          const last3 = (resp?.transcript || []).slice(-3)
            .map((t:any)=>`#${t.turn_no} ${t.agent_name}\n${t.output}`).join("\n\n");

          await lineReply(token, ev.replyToken, [{ type: "text", text: `เริ่มประชุม Hive แล้ว\n\n${last3 || "(ยังไม่มีบทสนทนา)"}` }]);
          continue;
        }

        if (/^!hive\s+next/i.test(text)) {
          const resp = await fetch(`${BASE_URL}/api/hive/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ groupId, rounds: 1 })
          }).then(r => r.json());

          const last = (resp?.transcript || []).slice(-1)[0];
          await lineReply(token, ev.replyToken, [{
            type: "text",
            text: last ? `รอบถัดไป #${last.turn_no} (${last.agent_name})\n${last.output}` : "ยังไม่มีข้อความ"
          }]);
          continue;
        }

        if (/^!hive\s+status/i.test(text)) {
          const resp = await fetch(`${BASE_URL}/api/hive/status?groupId=${encodeURIComponent(groupId)}`).then(r=>r.json());
          const s = resp?.session;
          const last3 = (resp?.turns || []).slice(-3)
            .map((t:any)=>`#${t.turn_no} ${t.agent_name}\n${t.output}`).join("\n\n");
          await lineReply(token, ev.replyToken, [{
            type: "text",
            text: s ? `สถานะ: ${s.status} | เทิร์นล่าสุด: ${s.last_turn}\n\n${last3}` : "ยังไม่มีห้อง Hive"
          }]);
          continue;
        }

        if (/^!hive\s+stop/i.test(text)) {
          // ใช้ status endpoint/DB ใน route ฝั่ง server จัดการ; ที่นี่แจ้งปิดให้ผู้ใช้
          await fetch(`${BASE_URL}/api/hive/status?groupId=${encodeURIComponent(groupId)}`).catch(()=>{});
          // ถ้ามี API แยก set done ก็เรียกเพิ่มได้ในอนาคต
          await lineReply(token, ev.replyToken, [{ type: "text", text: "ปิดวง Hive แล้วครับ" }]);
          continue;
        }
      } catch (e:any) {
        await lineReply(token, ev.replyToken, [{ type: "text", text: `Hive error: ${String(e?.message||e)}` }]);
        continue;
      }
    }
    // ===== [จบส่วนเพิ่ม Hive] =====

    // trigger → switch agent
    const tg = TRIGGERS.find(t => t.re.test(text));
    if (tg) {
      targetAgentName = tg.name;
      agent = await loadAgent(ch.owner_id, targetAgentName);
      const stripRe = new RegExp("^\\s*" + tg.stripWith + "\\s*:??\\s*", "i");
      text = text.replace(stripRe, "");
      if (!text) text = "ping";
    }

    // inbound log
    try {
      await logAgentEvent({
        owner_id: ch.owner_id,
        agent_id: agent.id,
        agent_name: agent.name,
        channel: "line",
        user_uid: userId,
        input_text: text,
        output_text: "",
        model: modelToString(agent.model),
        tokens_prompt: null,
        tokens_completion: null,
        latency_ms: null,
        ok: true,
        error: null,
      });
    } catch (e) {
      SAFE_LOG({ warn: "log_inbound_failed", e: String(e) });
    }

    // 🔎 QUICK DEBUG COMMANDS (ตอบกลับทันที ไม่ต้องคิด)
    if (/^!(who|whoami)$/i.test(text)) {
      const info = [
        `agent=${agent.name}`,
        `dest=${dest}`,
        `routed_from=${DEST_AGENT_ALLOWLIST[dest] ? "allowlist" : "db"}`,
        `father=${ch.father_user_id || "-"}`,
        `model=${modelToString(agent.model)}`,
        `caps=${JSON.stringify(getCaps(agent))}`
      ].join(" | ");

      await lineReply(token, ev.replyToken, [{ type: "text", text: info }]);
      try { await logAgentEvent({
        owner_id: ch.owner_id, agent_id: agent.id, agent_name: agent.name,
        channel: "line", user_uid: userId, input_text: text, output_text: info,
        model: modelToString(agent.model), tokens_prompt: null, tokens_completion: null,
        latency_ms: null, ok: true, error: null
      }); } catch {}
      continue;
    }

    if (/^!ping$/i.test(text)) {
      await lineReply(token, ev.replyToken, [{ type: "text", text: `pong from ${agent.name}` }]);
      continue;
    }

    try {
      const out: any = await think({
        text,
        agent,
        userId,
        fatherId: ch.father_user_id || null,
      });

      await lineReply(token, ev.replyToken, [{ type: "text", text: out?.answer ?? "..." }]);

      // outbound log
      try {
        await logAgentEvent({
          owner_id: ch.owner_id,
          agent_id: agent.id,
          agent_name: agent.name,
          channel: "line",
          user_uid: userId,
          input_text: text,
          output_text: out?.answer ?? "",
          model: modelToString(agent.model),
          tokens_prompt: num(out, "tokens_prompt"),
          tokens_completion: num(out, "tokens_completion"),
          latency_ms: num(out, "latency_ms"),
          ok: true,
          error: null,
        });
      } catch (e) {
        SAFE_LOG({ warn: "log_outbound_failed", e: String(e) });
      }
    } catch (e: any) {
      const msg = `สวัสดีครับ — ${agent.name}\n(${String(e?.message || e)})`;
      try { await lineReply(token, ev.replyToken, [{ type: "text", text: msg }]); } catch {}

      try {
        await logAgentEvent({
          owner_id: ch.owner_id,
          agent_id: agent.id,
          agent_name: agent.name,
          channel: "line",
          user_uid: userId,
          input_text: text,
          output_text: msg,
          model: modelToString(agent.model),
          tokens_prompt: null,
          tokens_completion: null,
          latency_ms: null,
          ok: false,
          error: String(e?.message || e),
        });
      } catch {}
    }
  }

  return NextResponse.json({ ok: true, destination: dest, routed_to: targetAgentName });
}
