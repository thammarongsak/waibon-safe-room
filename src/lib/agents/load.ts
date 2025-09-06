import { createClient } from "@supabase/supabase-js";
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function loadAgent(ownerId: string, name: "Waibon"|"Waibe"|"Zeta") {
  const { data, error } = await supa
    .from("ai_agents")
    .select(`id,name,training_profile_id,effective_capabilities,
             training_profiles:training_profile_id ( version, prompts )`)
    .eq("owner_id", ownerId).eq("name", name).single();
  if (error || !data) throw new Error("agent not found: " + (error?.message || name));
  return {
    id: data.id,
    name: data.name,
    training_profile_id: data.training_profile_id,
    training: { version: data.training_profiles.version, prompts: data.training_profiles.prompts },
    capabilities: data.effective_capabilities,
  };
}
