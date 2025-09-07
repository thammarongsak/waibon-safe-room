import { supabase } from "@/lib/db/supabase";

export type AgentName = "Waibon" | "Waibe" | "Zeta" | (string & {});

export type LoadedAgent = {
  id: string;
  name: AgentName;
  training_profile_id: string;
  training: { version: string; prompts: any };
  capabilities: any;
  persona?: any;
  // ถ้า ai_agents.model เป็น UUID ของ ai_models -> จะถูกเติมเป็น object นี้
  model?: { id: string; name: string; provider?: string } | null;
  // ยังคงเก็บค่าเดิมไว้เผื่อกรณีเก่าที่เก็บชื่อโมเดลเป็นสตริงตรง ๆ
  modelId?: string | null;
};

function isUuidLike(s: any) {
  return typeof s === "string" && /^[0-9a-fA-F-]{36}$/.test(s);
}

export async function loadAgent(ownerId: string, name: AgentName): Promise<LoadedAgent> {
  // ดึง ai_agents + training_profiles (ไม่ join ai_models เพื่อกันปัญหา constraint name)
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

  let model: { id: string; name: string; provider?: string } | null = null;
  const rawModel = (data as any).model ?? null;

  // ถ้า model เป็น UUID -> ดึงชื่อโมเดลจากตาราง ai_models
  if (isUuidLike(rawModel)) {
    const { data: m, error: mErr } = await supabase
      .from("ai_models")
      .select("id, name, provider")
      .eq("id", rawModel)
      .single();
    if (!mErr && m) model = { id: m.id, name: m.name, provider: m.provider };
  }

  return {
    id: data.id,
    name: data.name as AgentName,
    training_profile_id: data.training_profile_id,
    training: { version: tp?.version ?? "unknown", prompts: tp?.prompts ?? {} },
    capabilities: (data as any).effective_capabilities,
    persona: (data as any).persona,
    modelId: rawModel,     // เก็บค่าดิบไว้ (จะเป็น uuid หรือชื่อโมเดลก็ได้)
    model,                 // ถ้าเป็น uuid จะมี name พร้อมใช้งาน
  };
}
