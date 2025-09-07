import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/line/verify";
import { loadLineChannelByDestination } from "@/lib/channels/load";
import { loadAgent } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ------------------------------
 * [C] Router ชัดตัว–ชัดช่อง
 * - บังคับแม็ป destination → agent_name แบบ explicit (allowlist)
 * - ถ้าไม่มีใน allowlist จะ fallback ไปใช้ค่าใน DB (line_channels.agent_name)
 * -------------------------------- */
const DEST_AGENT_ALLOWLIST: Record<string, "Waibon" | "Waibe" | "Zeta"> = {
  // พ่อ (U688...) ให้คุยกับ Waibon เสมอ
  "U688db4b83e6cb70f4f5e5d121a8a07db": "Waibon",
  // ช่องอื่น ๆ ของพ่อ (แก้/เพิ่มได้ตามจริง)
  "U9384a9f7e13ae3a6dcdee5fe2656aafb": "Zeta",
  "Ucc5ab43be188b5d32132ce3236edf442": "Waibe",
  "Uc88286f48b993140940a064f70952fb5": "Waibon",
};

/** ตัวช่วยส่งข้อความกลับ LINE */
async function lineReply(token: string, replyToken: string, messages: any[]) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) throw new Error(`LINE reply ${res.status}: ${await res.text()}`);
}

/** ตัด prefix trigger ออก */
function stripPrefix(text: string, prefix: string) {
  return text.replace(new RegExp("^\\s*" + prefix + "\\s*:?\\s*", "i"), "");
}

/** ------------------------------
 * [D] Trigger phrase
 * รองรับทั้งไทย/อังกฤษ และมี ":" หรือไม่มี ":" ก็ได้
 * - waibon: / ไวบอน:
 * - waibe:  / ไวบิ:
 * - zeta:   / ซีต้า:
 * -------------------------------- */
const TRIGGERS: Array<{ name: "Waibon" | "Waibe" | "Zeta"; re: RegExp; stripWith: string }> = [
  { name: "Waibon", re: /^(waibon|ไวบอน)\s*:?\s*/i, stripWith: "(?:waibon|ไวบอน)" },
  { name: "Waibe",  re: /^(waibe|ไวบิ)\s*:?\s*/i,   stripWith: "(?:waibe|ไวบิ)" },
  { name: "Zeta",   re: /^(zeta|ซีต้า)\s*:?\s*/i,  stripWith: "(?:zeta|ซีต้า)" },
];

export async function POST(req: Request) {
  const raw = await req.text();
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const dest = body?.destination || "";
  if (!dest) return NextResponse.json({ ok: false, error: "missing destination" }, { status: 400 });

  // โหลดคอนฟิกช่องจาก DB
  const ch = await loadLineChannelByDestination(dest);
  if (!ch) return NextResponse.json({ ok: false, error: "unknown_channel" }, { status: 200 });

  // verify ลายเซ็นด้วย secret ของช่องนั้น (หากไม่ตรง ตอบ 200 เพื่อลด retry)
  const sig = req.headers.get("x-line-signature");
  if (!verifySignature(ch.secret, raw, sig)) {
    return NextResponse.json({ ok: false, warn: "invalid_signature" }, { status: 200 });
  }

  // [C] ตัดสินใจตัว agent “ชัดตัว–ชัดช่อง”
  const mappedFromAllowlist = DEST_AGENT_ALLOWLIST[dest];
  const defaultAgentName = (ch.agent_name as "Waibon" | "Waibe" | "Zeta") || "Waibon";
  let targetAgentName: "Waibon" | "Waibe" | "Zeta" = mappedFromAllowlist || defaultAgentName;

  // โหลด agent ตาม targetAgentName เริ่มต้นจาก routing ของช่อง
  let agent = await loadAgent(ch.owner_id, targetAgentName);

  // วนลูปอีเวนต์
  for (const ev of body.events ?? []) {
    if (ev.type !== "message" || ev.message?.type !== "text") continue;

    const userId = ev?.source?.userId || null;
    let text: string = String(ev.message.text ?? "").trim();

    // [D] เช็คนำหน้าด้วย trigger — ถ้าพบให้สลับ agent ตาม trigger และตัด prefix ออก
    const t = TRIGGERS.find(t => t.re.test(text));
    if (t) {
      targetAgentName = t.name;
      agent = await loadAgent(ch.owner_id, targetAgentName);
      // ตัด prefix ที่เรียกบอทออกก่อนส่งเข้าคิด
      const stripRe = new RegExp("^\\s*" + t.stripWith + "\\s*:??\\s*", "i");
      text = text.replace(stripRe, "");
      if (!text) text = "ping"; // ถ้าพิมพ์แค่ trigger ให้มีข้อความอย่างน้อย 1 คำ
    }

    try {
      const out = await think({
        text,
        agent,
        userId,
        fatherId: ch.father_user_id || null,
        // (ถ้าต้อง): channelId/ch.id เพิ่มได้เพื่อ logging
      });

      await lineReply(ch.token, ev.replyToken, [{ type: "text", text: out.answer }]);
    } catch (e: any) {
      const fb = `สวัสดีครับ — ${agent.name} | db:OK\n(${String(e?.message || e)})`;
      try { await lineReply(ch.token, ev.replyToken, [{ type: "text", text: fb }]); } catch {}
    }
  }

  return NextResponse.json({
    ok: true,
    destination: dest,
    routed_to: targetAgentName,
  });
}
