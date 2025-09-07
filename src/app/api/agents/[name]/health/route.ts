import { NextResponse } from "next/server";
import { loadAgent } from "@/lib/agents/load";

// ✅ ประกาศเองในไฟล์นี้
type AgentName = "Waibon" | "Waibe" | "Zeta";

const OWNER_ID = "62000af4-6871-4d6d-9286-0aa29b0ace15";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { name: AgentName } }) {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY
  };
  try {
    const agent = await loadAgent(OWNER_ID, params.name);
    return NextResponse.json({
      ok: true,
      env,
      agent: {
        id: agent.id,
        name: agent.name,
        tp_version: agent.training.version,
        tools: agent.capabilities?.tools ?? null,
        models: agent.capabilities?.models ?? null
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, env, error: String(e?.message || e) }, { status: 500 });
  }
}
