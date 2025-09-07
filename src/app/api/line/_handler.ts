import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/line/verify";
import { lineReply } from "@/lib/line/reply";
import { loadAgent } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";


const OWNER_ID = "62000af4-6871-4d6d-9286-0aa29b0ace15"; // ของพ่อ

type BotConfig = { secret: string; token: string; agentName: "Waibon"|"Waibe"|"Zeta" };

export async function handleWebhook(req: Request, conf: BotConfig) {
  const raw = await req.text();
  const ok = verifySignature(conf.secret, raw, req.headers.get("x-line-signature"));
  if (!ok) return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });

  const body = JSON.parse(raw);
  const agent = await loadAgent(OWNER_ID, conf.agentName);

  for (const ev of body.events ?? []) {
  if (ev.type === "message" && ev.message?.type === "text") {
    const answer = await think({ text: ev.message.text, agent });
    await lineReply(conf.token, ev.replyToken, [{ type: "text", text: answer }]);
    }
  }
  return NextResponse.json({ ok: true });
}
export const runtime = "nodejs";
