import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/line/verify";
import { loadLineChannelByDestination } from "@/lib/channels/load";
import { loadAgent } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function lineReply(token: string, replyToken: string, messages: any[]) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) throw new Error(`LINE reply ${res.status}: ${await res.text()}`);
}

export async function POST(req: Request) {
  const raw = await req.text();
  let body: any;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }

  console.log("LINE destination =", body?.destination);
  
  const dest = body?.destination || "";
  if (!dest) return NextResponse.json({ ok: false, error: "missing destination" }, { status: 400 });

  // 1) โหลดคอนฟิกช่องจาก DB (ไม่มี fallback ENV)
  const ch = await loadLineChannelByDestination(dest);

  // 2) verify ลายเซ็นด้วย secret ของช่องนั้น
  const sig = req.headers.get("x-line-signature");
  if (!verifySignature(ch.secret, raw, sig)) {
    // 200 เพื่อลด retry ของ LINE แต่แสดงสถานะให้ dev ดู
    return NextResponse.json({ ok: false, warn: "invalid_signature" });
  }

  // 3) โหลด agent ที่แมปกับช่องนี้
  const agent = await loadAgent(ch.owner_id, ch.agent_name as any);

  // 4) วนตอบข้อความ
  for (const ev of body.events ?? []) {
    if (ev.type === "message" && ev.message?.type === "text") {
       console.log("from user =", ev.source?.userId); // [3] userId ผู้ทัก (นี่แหละของพ่อจริง)
      try {
        const out = await think({
          text: ev.message.text,
          agent,
          userId: ev.source?.userId || null,
          fatherId: ch.father_user_id || null,
        });
        await lineReply(ch.token, ev.replyToken, [{ type: "text", text: out.answer }]);
      } catch (e: any) {
        const fb = `สวัสดีครับ — ${agent.name} | tp:${agent.training.version} | db:OK\n(${String(e?.message || e)})`;
        try { await lineReply(ch.token, ev.replyToken, [{ type: "text", text: fb }]); } catch {}
      }
    }
  }

  return NextResponse.json({ ok: true, agent: agent.name, destination: dest });
}
