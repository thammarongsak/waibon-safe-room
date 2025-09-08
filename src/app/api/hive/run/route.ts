// src/app/api/hive/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ใช้ think แทน callAgent (ตามโปรเจกต์พ่อ)
import { think } from "@/lib/agents/brain";
import { getAgentByName } from "@/lib/agents/load";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

type AgentKey = "WaibonOS" | "WaibeAI" | "ZetaAI";

function pickNextTag(text: string): AgentKey | "done" {
  const m = text.match(/\[NEXT\]\s*(WaibonOS|WaibeAI|ZetaAI|done)\s*\[\/NEXT\]/i);
  return (m?.[1] as any) || "done";
}

function buildHivePrompt(agentName: string, persona: any, contextLines: string[]) {
  const protocol = persona?.hive_protocol || {};
  const fmt =
    protocol.format ||
    "[ROLE]…[/ROLE]\n[TASK]…[/TASK]\n[THOUGHT]…[/THOUGHT]\n[OUTPUT]…[/OUTPUT]\n[NEXT]{WaibonOS|WaibeAI|ZetaAI|done}[/NEXT]";

  const rules = (protocol.rules || [
    "สั้น กระชับ ตรงประเด็น",
    "อ้างอิงสิ่งที่เอเยนต์ก่อนหน้าพูดแบบมีเหตุผล",
    "จบด้วย [NEXT]{WaibonOS|WaibeAI|ZetaAI|done}[/NEXT]"
  ]).join("\n- ");

  const history = contextLines.slice(-8).join("\n");

  return (
`คุณคือ ${agentName}. ตอบด้วย Hive Protocol เท่านั้น

Format:
${fmt}

Rules:
- ${rules}

บริบทล่าสุด:
${history ? history : "(ว่าง)"}`
  );
}

async function ensureSession(groupId: string, title?: string): Promise<string> {
  const { data: rows } = await supabase
    .from("hive_sessions")
    .select("id,status")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!rows?.length) {
    const { data, error } = await supabase
      .from("hive_sessions")
      .insert({ group_id: groupId, title: title || "Hive Room", status: "running" })
      .select("id")
      .single();
    if (error) throw error;
    return data!.id as string;
  } else {
    const sid = rows[0].id as string;
    await supabase.from("hive_sessions").update({ status: "running" }).eq("id", sid);
    return sid;
  }
}

async function appendTurn(sessionId: string, turn_no: number, agent_name: string, output: string) {
  await supabase.from("hive_turns").insert({ session_id: sessionId, turn_no, agent_name, output });
  await supabase.from("hive_sessions").update({ last_turn: turn_no, updated_at: new Date().toISOString() }).eq("id", sessionId);
}

export async function POST(req: NextRequest) {
  try {
    const { groupId, title, rounds = 3 } = (await req.json()) as {
      groupId: string;
      title?: string;
      rounds?: number;
    };
    if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

    const sessionId = await ensureSession(groupId, title);

    // โหลด agent ทั้งสามจากชื่อที่พ่อใช้ใน DB
    const waibon = await getAgentByName(["WaibonOS", "Waibon"]);
    const waibe  = await getAgentByName(["WaibeAI", "Waibe"]);
    const zeta   = await getAgentByName(["ZetaAI", "Zeta"]);
    const agents: Record<AgentKey, any> = { WaibonOS: waibon, WaibeAI: waibe, ZetaAI: zeta };

    // ดึงบริบทเดิม
    const { data: turns } = await supabase
      .from("hive_turns")
      .select("turn_no,agent_name,output")
      .eq("session_id", sessionId)
      .order("turn_no", { ascending: true });

    const contextLines = (turns || []).map(t => `[${t.turn_no}] ${t.agent_name}: ${t.output}`);

    // หมุนคิว
    let current: AgentKey = "WaibonOS";
    let turn = (turns?.[turns.length - 1]?.turn_no || 0) + 1;
    const endAt = turn + Math.max(1, Math.min(10, rounds)) - 1;

    while (turn <= endAt) {
      const a = agents[current];

      // ใช้ think() ของโปรเจกต์พ่อ โดยส่งข้อความรวม (prompt string)
      const prompt = buildHivePrompt(a.name, a.persona, contextLines);
      const out: any = await think({
        text: prompt,
        agent: a,
        userId: null,           // ไม่ผูก user เฉพาะตอนรันวงกลุ่ม
        fatherId: null,
      });

      const reply = String(out?.answer ?? "");
      await appendTurn(sessionId, turn, a.name, reply);

      const next = pickNextTag(reply);
      if (next === "done") break;

      current = next as AgentKey;
      contextLines.push(`[${turn}] ${a.name}: ${reply}`);
      turn++;
    }

    const { data: after } = await supabase
      .from("hive_turns")
      .select("turn_no,agent_name,output")
      .eq("session_id", sessionId)
      .order("turn_no", { ascending: true });

    return NextResponse.json({ ok: true, sessionId, transcript: after || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
