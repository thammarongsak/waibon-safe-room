import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  const { data: sess } = await supabase
    .from("hive_sessions")
    .select("id,group_id,title,status,last_turn,created_at,updated_at")
    .eq("group_id", groupId)
    .order("created_at",{ascending:false})
    .limit(1);

  if (!sess?.length) return NextResponse.json({ ok: true, status: "none" });

  const sid = sess[0].id as string;
  const { data: turns } = await supabase
    .from("hive_turns")
    .select("turn_no,agent_name,output,created_at")
    .eq("session_id", sid)
    .order("turn_no",{ascending:true});

  return NextResponse.json({ ok: true, session: sess[0], turns: turns||[] });
}
