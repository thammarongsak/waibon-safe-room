import { NextResponse } from "next/server";
import crypto from "crypto";
import { verifySignature } from "@/lib/line/verify";
import { loadLineChannelByDestination } from "@/lib/channels/load";
import { loadAgent } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG = process.env.DEBUG_WEBHOOK === "1";

/** reply helper */
async function lineReply(token: string, replyToken: string, messages: any[]) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) throw new Error(`LINE reply ${res.status}: ${await res.text()}`);
}

/** สร้างรายการ ENV-fallback ทั้ง 3 ช่อง แล้วเลือกจากลายเซ็นที่ “ผ่าน” */
function pickEnvFallbackBySignature(raw: string, signature: string | null) {
  type F = { label: string; secret?: string | null; token?: string | null; agent?: string | null };
  const fallbacks: F[] = [
    { label: "ENV#1", secret: process.env.LINE_CHANNEL_SECRET,  token: process.env.LINE_CHANNEL_ACCESS_TOKEN,  agent: process.env.FALLBACK_AGENT1 || "Waibon" },
    { label: "ENV#2", secret: process.env.LINE2_CHANNEL_SECRET, token: process.env.LINE2_CHANNEL_ACCESS_TOKEN, agent: process.env.FALLBACK_AGENT2 || "Waibe"  },
    { label: "ENV#3", secret: process.env.LINE3_CHANNEL_SECRET, token: process.env.LINE3_CHANNEL_ACCESS_TOKEN, agent: process.env.FALLBACK_AGENT3 || "Zeta"   },
  ];

  for (const f of fallbacks) {
    if (!f.secret || !f.token) continue;
    try {
      const ok = verifySignature(f.secret, raw, signature);
      if (ok) return f;
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  let body: any;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }

  const dest = body?.destination || "";
  const sig  = req.headers.get("x-line-signature");

  // 1) พยายามโหลดช่องจาก DB ก่อน (ตามแนว DB-first)
  let ch:
    | { destination?: string; secret: string; token: string; owner_id: string; agent_name: string; father_user_id?: string | null }
    | null = null;

  try {
    if (dest) ch = await loadLineChannelByDestination(dest);
  } catch (e: any) {
    DEBUG && console.warn("[webhook] DB channel not found:", String(e?.message || e));
  }

  // 2) ถ้า DB ไม่มี/ไม่พบ ให้ “จับคู่จากลายเซ็น” กับ ENV ทั้งสามช่อง
  if (!ch) {
    const picked = pickEnvFallbackBySignature(raw, sig);
    if (picked) {
      DEBUG && console.log("[webhook] using", picked.label, "by signature match");
      ch = {
        secret: picked.secret!,
        token: picked.token!,
        owner_id: process.env.WAIBON_OWNER_ID || "62000af4-6871-4d6d-9286-0aa29b0ace15",
        agent_name: picked.agent || "Waibon",
        father_user_id: process.env.FATHER_LINE_USER_ID || null,
      };
    } else {
      DEBUG && console.error("[webhook] no channel matched (DB empty & no ENV signature match)");
      // ตอบ 200 เพื่อไม่ให้ LINE retry ถี่ แต่บอกสถานะไว้
      return NextResponse.json({ ok: false, warn: "no_channel_config" });
    }
  }

  // 3) verify อีกชั้นให้ชัด
  const okSig = verifySignature(ch.secret, raw, sig);
  if (!okSig) {
    DEBUG && console.warn("[webhook] invalid_signature after resolve");
    return NextResponse.json({ ok: false, warn: "invalid_signature" });
  }

  // 4) โหลดเอเจนต์ของช่อง
  let agent: Awaited<ReturnType<typeof loadAgent>>;
  try {
    agent = await loadAgent(ch.owner_id, ch.agent_name as any);
    DEBUG && console.log("[webhook] agent:", agent.name, "tp:", agent.training?.version);
  } catch (e: any) {
    DEBUG && console.error("[webhook] loadAgent error:", String(e?.message || e));
    return NextResponse.json({ ok: false, error: "agent_not_found" });
  }

  // 5) ตอบข้อความ
  for (const ev of body.events ?? []) {
    if (ev.type === "message" && ev.message?.type === "text") {
      const userId = ev.source?.userId || null;
      try {
        const out = await think({
          text: ev.message.text,
          agent,
          userId,
          fatherId: ch.father_user_id || null,
        });
        await lineReply(ch.token, ev.replyToken, [{ type: "text", text: out.answer }]);
      } catch (e: any) {
        const msg = String(e?.message || e);
        DEBUG && console.error("[webhook] think/reply error:", msg);
        try {
          const fb = `สวัสดีครับ — ${agent.name} | tp:${agent.training.version} | db:OK\n(${msg})`;
          await lineReply(ch.token, ev.replyToken, [{ type: "text", text: fb }]);
        } catch {}
      }
    }
  }

  return NextResponse.json({ ok: true, agent: (agent as any)?.name || ch.agent_name, destination: dest || "ENV" });
}
