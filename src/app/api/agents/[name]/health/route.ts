import { NextResponse } from "next/server";
import { loadAgent } from "@/lib/agents/load";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const ownerId = process.env.WAIBON_OWNER_ID || "62000af4-6871-4d6d-9286-0aa29b0ace15";
  const agent = await loadAgent(ownerId, params.name as any);
  return NextResponse.json({
    ok: true,
    id: agent.id,
    name: agent.name,
    tp_version: agent.training.version,
    has_persona: !!agent.persona,
    has_prompts: !!agent.training?.prompts,
  });
}
