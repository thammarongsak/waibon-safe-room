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

/* ---------- helper: safely get LINE access token ---------- */
function getChannelAccessToken(ch: any): string {
  // รองรับชื่อฟิลด์ที่พบได้บ่อย
  const t =
    ch?.access_token ??
    ch?.token ??
    ch?.channel_access_token ??
    ch?.accessToken ??
    ch?.channelAccessToken;
  if (!t) throw new Error("Missing LINE access token on channel config");
  return String(t);
}

/* ---------- [C] Router: destination → agent (allowlist) ---------- */
const DEST_AGENT_ALLOWLIST: Record<string, "Waibon" | "Waibe" | "Zeta"> = {
  "U688db4b83e6cb70f4f5e5d121a8a07db": "Waibon", // พ่อ
  "U9384a9f7e13ae3a6dcdee5fe2656aafb": "Zeta",
  "Ucc5ab43be188b5d32132ce3236edf442": "Waibe",
  "Uc88286f48b993140940a064f70952fb5": "Waibon",
};

/* ---------- [D] Trigger ไทย/อังกฤษ ---------- */
const TRIGGERS: Array<{ name: "Waibon" | "Waibe" | "Zeta"; re: RegExp; stripWith: string }> = [
  { name: "Waibon", re: /^(waibon|ไวบอน)\s*:?\s*/i, stripWith: "(?:waibon|ไวบอน)" },
  { name: "Waibe",  re: /^(waibe|ไวบิ)\s*:?\s*/i,   stripWith: "(?:waibe|ไวบิ)" },
  { name: "Zeta",   re: /^(zeta|ซีต้า)\s*:?\s*/i,  stripWith: "(?:zeta|ซีต้า)" },
];

const SAFE_LOG = (o: any) => { try { console.log(JSON.stringify(o)); } catch { console.log(o); } };

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
  const sig = req.headers.get("x-line-signature");
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

    try {
      const out = await think({
        text,
        agent,
        userId,
        fatherId: ch.father_user_id || null,
      });

      // ✅ ใช้ token จาก channel แบบปลอด type
      const token = getChannelAccessToken(ch);
      await lineReply(token, ev.replyToken, [{ type: "text", text: out.answer }]);

      // outbound log
      try {
        await logAgentEvent({
          owner_id: ch.owner_id,
          agent_id: agent.id,
          agent_name: agent.name,
          channel: "line",
          user_uid: userId,
          input_text: text,
          output_text: out.answer ?? "",
          model: modelToString(agent.model),
          tokens_prompt: out.tokens_prompt ?? null,
          tokens_completion: out.tokens_completion ?? null,
          latency_ms: out.latency_ms ?? null,
          ok: true,
          error: null,
        });
      } catch (e) {
        SAFE_LOG({ warn: "log_outbound_failed", e: String(e) });
      }
    } catch (e: any) {
      const token = getChannelAccessToken(ch);
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
