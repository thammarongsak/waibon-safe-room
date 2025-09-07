import { supabase } from "@/lib/db/supabase";
import type { AgentName } from "@/lib/channels/load";

export type LoadedAgent = {
  id: string;
  name: AgentName;
  training_profile_id: string;
  training: { version: string; prompts: any };
  capabilities: any;
  persona?: any;
  modelId?: string | null;
};

export async function loadAgent(ownerId: string, name: AgentName): Promise<LoadedAgent> {
  const { data, error } = await supabase
    .from("ai_agents")
    .select(`
      id, name, training_profile_id, effective_capabilities, model, persona,
      training_profiles:training_profile_id ( version, prompts )
    `)
    .eq("owner_id", ownerId)
    .eq("name", name)
    .single();

  if (error || !data) throw new Error("agent not found: " + (error?.message || name));

  const tp = Array.isArray((data as any).training_profiles)
    ? (data as any).training_profiles[0]
    : (data as any).training_profiles;

  return {
    id: data.id,
    name: data.name as AgentName,
    training_profile_id: data.training_profile_id,
    training: { version: tp?.version ?? "unknown", prompts: tp?.prompts ?? {} },
    capabilities: (data as any).effective_capabilities,
    persona: (data as any).persona,
    modelId: (data as any).model ?? null,
  };
}
