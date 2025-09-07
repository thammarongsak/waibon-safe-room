import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/line/verify";
import { lineReply } from "@/lib/line/reply";
import { loadAgent, AgentName } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";
import { logAgentEvent } from "@/lib/agents/log";

// ตั้ง OWNER ของพ่อ (public.users.id)
const OWNER_ID = "62000af4-6871-4d6d-9286-0aa29b0ace15";

// rate-limit ง่ายๆ (in-memory)
const BUCKET = new Map<string, { ts: number; count: number }>();
function hit(ip: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const b = BUCKET.get(ip) ?? { ts: now, count: 0 };
  if (now - b.ts > windowMs) { b.ts = now; b.count = 0; }
  b.count += 1; BUCKET.set(ip, b);
  return b.count <= limit;
}

type BotConfig = { secret: string; token: string; agentName: AgentName };

export async function handleWebhook(req: Request, conf: BotConfig) {
  try {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0] || "unknown";
    if (!hit(ip)) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

    const raw = await req.text();
    const ok = verifySignature(conf.secret, raw, req.headers.get("x-line-signature"));
    if (!ok) return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });

    const body = JSON.parse(raw);
    const agent = await loadAgent(OWNER_ID, conf.agentName);

    for (const ev of body.events ?? []) {
      if (ev.type === "message" && ev.message?.type === "text") {
        const t0 = Date.now();
        let answer = ""; let model = ""; let okResp = true; let errStr: string | null = null;

        try {
          const out = await think({ text: ev.message.text, agent });
          answer = out.answer; model = out.model;
          await lineReply(conf.token, ev.replyToken, [{ type: "text", text: answer }]);
        } catch (e: any) {
          okResp = false; errStr = String(e?.message || e);
          const fallback = `สวัสดี พ่อครับ — ${agent.name} | tp:${agent.training.version} | db:OK\n(ชั่วคราว: ${errStr})`;
          await lineReply(conf.token, ev.replyToken, [{ type: "text", text: fallback }]);
        } finally {
          await logAgentEvent({
            owner_id: OWNER_ID,
            agent_id: agent.id,
            agent_name: agent.name,
            channel: "line",
            user_uid: ev.source?.userId ?? null,
            input_text: ev.message.text,
            output_text: answer,
            model,
            tokens_prompt: null,
            tokens_completion: null,
            latency_ms: Date.now() - t0,
            ok: okResp,
            error: errStr
          });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
