import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/line/verify";
import { lineReply } from "@/lib/line/reply";
import { loadLineChannelByDestination } from "@/lib/channels/load";
import { loadAgent } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { 
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const dest = body?.destination;
  if (!dest) return NextResponse.json({ ok: false, error: "missing destination" }, { status: 400 });

  // 1) config ช่องจาก DB
  const ch = await loadLineChannelByDestination(dest);

  // 2) verify ลายเซ็นด้วย secret ของช่องนั้น
  const sig = req.headers.get("x-line-signature");
  if (!verifySignature(ch.secret, raw, sig)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  // 3) โหลด agent ของช่องนั้นจาก DB
  const agent = await loadAgent(ch.owner_id, ch.agent_name);

  // 4) ประมวลผลข้อความ
  for (const ev of body.events ?? []) {
    if (ev.type === "message" && ev.message?.type === "text") {
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
        await lineReply(ch.token, ev.replyToken, [{ type: "text", text: fb }]);
      }
    }
  }

  return NextResponse.json({ ok: true, agent: agent.name, destination: dest });
}
