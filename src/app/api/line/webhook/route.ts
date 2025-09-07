import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/line/verify";
import { loadLineChannelByDestination } from "@/lib/channels/load";
import { loadAgent } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG = process.env.DEBUG_WEBHOOK === "1";

/** Minimal reply helper */
async function lineReply(token: string, replyToken: string, messages: any[]) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LINE reply ${res.status}: ${text}`);
  }
}

/** ENV fallback (ใช้เฉพาะกรณีไม่มีข้อมูลใน DB) */
function envFallback() {
  const secret = process.env.LINE_CHANNEL_SECRET;
  const token  = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const owner  = process.env.WAIBON_OWNER_ID || "62000af4-6871-4d6d-9286-0aa29b0ace15";
  const agent  = (process.env.FALLBACK_AGENT_NAME as any) || "Waibon";
  if (secret && token) {
    return { secret, token, owner_id: owner, agent_name: agent, father_user_id: process.env.FATHER_LINE_USER_ID || null };
  }
  return null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    DEBUG && console.error("[webhook] bad json");
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const dest = body?.destination || "";
  DEBUG && console.log("[webhook] destination:", dest);

  // 1) โหลด config ช่องทางจาก DB (หรือ fallback จาก ENV ชั่วคราว)
  let ch:
    | { destination?: string; secret: string; token: string; owner_id: string; agent_name: string; father_user_id?: string | null }
    | null = null;

  try {
    if (dest) ch = await loadLineChannelByDestination(dest);
  } catch (e: any) {
    DEBUG && console.warn("[webhook] DB channel not found:", String(e?.message || e));
  }
  if (!ch) {
    ch = envFallback();
    if (!ch) {
      DEBUG && console.error("[webhook] no channel config (DB & ENV empty)");
      // ตอบ 200 เพื่อไม่ให้ LINE retry รัว ๆ แต่ log ไว้
      return NextResponse.json({ ok: false, warn: "no_channel_config" });
    }
    DEBUG && console.log("[webhook] using ENV fallback config for agent:", ch.agent_name);
  }

  // 2) verify signature
  const sig = req.headers.get("x-line-signature");
  const sigOK = verifySignature(ch.secret, raw, sig);
  DEBUG && console.log("[webhook] signature ok:", sigOK);
  if (!sigOK) {
    // ตอบ 200 แต่ไม่ทำงาน เพื่อให้ LINE ไม่ retry รัว แล้วพ่อเช็ค secret ให้ถูก
    return NextResponse.json({ ok: false, warn: "invalid_signature" });
  }

  // 3) โหลด agent จาก DB
  let agent: Awaited<ReturnType<typeof loadAgent>>;
  try {
    agent = await loadAgent(ch.owner_id, ch.agent_name as any);
    DEBUG && console.log("[webhook] agent loaded:", agent.name, "tp:", agent.training?.version);
  } catch (e: any) {
    DEBUG && console.error("[webhook] loadAgent error:", String(e?.message || e));
    return NextResponse.json({ ok: false, error: "agent_not_found" });
  }

  // 4) วนตอบ event
  for (const ev of body.events ?? []) {
    if (ev.type === "message" && ev.message?.type === "text") {
      const userId = ev.source?.userId || null;
      const textIn = ev.message.text;

      try {
        const out = await think({
          text: textIn,
          agent,
          userId,
          fatherId: ch.father_user_id || null,
        });
        DEBUG && console.log("[webhook] reply via model:", out.model);

        await lineReply(ch.token, ev.replyToken, [{ type: "text", text: out.answer }]);
      } catch (e: any) {
        const msg = String(e?.message || e);
        DEBUG && console.error("[webhook] think/reply error:", msg);

        // พยายามส่ง fallback ถ้า token ใช้ได้
        try {
          const fb = `สวัสดีครับ — ${agent.name} | tp:${agent.training.version} | db:OK\n(${msg})`;
          await lineReply(ch.token, ev.replyToken, [{ type: "text", text: fb }]);
        } catch (e2: any) {
          DEBUG && console.error("[webhook] fallback reply failed:", String(e2?.message || e2));
        }
      }
    }
  }

  return NextResponse.json({ ok: true, agent: (agent as any)?.name || ch.agent_name, destination: dest || "ENV" });
}
