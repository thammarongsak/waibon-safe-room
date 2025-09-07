import { createClient } from "@supabase/supabase-js";
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function logAgentEvent(row: {
  owner_id: string;
  agent_id: string;
  agent_name: string;
  channel: "line";
  user_uid?: string | null;    // LINE userId ถ้าต้องการ
  input_text: string;
  output_text: string;
  model: string;
  tokens_prompt?: number | null;
  tokens_completion?: number | null;
  latency_ms?: number | null;
  ok: boolean;
  error?: string | null;
}) {
  await supa.from("agent_logs").insert({
    ...row,
    created_at: new Date().toISOString()
  });
}
