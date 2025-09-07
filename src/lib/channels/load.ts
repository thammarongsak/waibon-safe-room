import { supabase } from "@/lib/db/supabase";

export type AgentName = "Waibon" | "Waibe" | "Zeta" | (string & {});

export type ChannelConf = {
  destination: string;
  secret: string;
  token: string;
  owner_id: string;
  agent_name: AgentName;
  father_user_id?: string | null;
};

export async function loadLineChannelByDestination(dest: string): Promise<ChannelConf> {
  const { data, error } = await supabase
    .from("line_channels")
    .select("owner_id, destination, secret, access_token, agent_name, father_user_id, is_enabled")
    .eq("destination", dest)
    .maybeSingle(); // ✅ กัน “Cannot coerce …”

  if (error || !data) throw new Error("line channel not found: " + (error?.message || dest));
  if (data.is_enabled === false) throw new Error("line channel disabled: " + dest);

  return {
    destination: data.destination,
    secret: data.secret,
    token: data.access_token,
    owner_id: data.owner_id,
    agent_name: data.agent_name,
    father_user_id: data.father_user_id,
  };
}
