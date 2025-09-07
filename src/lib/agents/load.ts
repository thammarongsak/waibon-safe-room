// src/lib/agents/load.ts
import { createClient } from "@supabase/supabase-js";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ ใส่ export ตรงนี้
export type AgentName = "Waibon" | "Waibe" | "Zeta";

export type LoadedAgent = {
  id: string;
  name: AgentName;
  training_profile_id: string;
  training: { version: string; prompts: any };
  capabilities: any;
  modelId?: string;
};

export async function loadAgent(ownerId: string, name: AgentName): Promise<LoadedAgent> {
  const { data, error } = await supa
    .from("ai_agents")
    .select(`
      id, name, training_profile_id, effective_capabilities,
      training_profiles:training_profile_id ( version, prompts )
    `)
    .eq("owner_id", ownerId)
    .eq("name", name)
    .single();

  if (error || !data) {
    throw new Error("agent not found: " + (error?.message || name));
  }

  // 👉 บางสคีม่า Supabase จะส่งเป็นอ็อบเจ็กต์เดี่ยว, บางกรณีเป็นอาเรย์
  const tpRaw: any = (data as any).training_profiles;
  const tp = Array.isArray(tpRaw) ? tpRaw[0] : tpRaw;

  return {
    id: data.id,
    name: data.name as AgentName,
    training_profile_id: data.training_profile_id,
    training: {
      version: tp?.version ?? "unknown",
      prompts: tp?.prompts ?? {},
    },
    capabilities: (data as any).effective_capabilities,
  };
}
