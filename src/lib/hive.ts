// src/lib/hive.ts
import { supabaseServer } from './supabaseServer';

type AgentName = 'WaibonOS' | 'WaibeAI' | 'ZetaAI';
type Agent = { id: string; name: AgentName; persona: any; model: string };

// ✅ ค่าเริ่มต้นถ้า DB ว่าง
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_PERSONA: Record<AgentName, any> = {
  WaibonOS: { role: 'leader', style: 'calm' },
  WaibeAI:  { role: 'coordinator', style: 'direct' },
  ZetaAI:   { role: 'strategist', style: 'analytical' },
};

/** ---------- ปรับให้ “หาเอเจนต์ได้เสมอ” ---------- */
async function getAgentByName(name: AgentName): Promise<Agent> {
  // 1) ลองจาก ai_agents (ถ้ามี)
  const ai = await supabaseServer
    .from('ai_agents')
    .select('id,name,model,persona')
    .eq('name', name)
    .maybeSingle(); // ← ไม่ throw ถ้าไม่เจอ

  if (ai.data) {
    return {
      id: ai.data.id,
      name: ai.data.name as AgentName,
      persona: ai.data.persona || DEFAULT_PERSONA[name],
      model: ai.data.model || DEFAULT_MODEL,
    };
  }

  // 2) ตกมาอ่าน hive_agents (สคีม่าของพ่อ)
  const hive = await supabaseServer
    .from('hive_agents')
    .select('name, persona')
    .eq('name', name)
    .maybeSingle();

  const persona = hive.data?.persona || DEFAULT_PERSONA[name];

  // 3) สร้างตัวแทนชั่วคราวให้ทำงานได้ทันที (id ใช้ชื่อ)
  return { id: name, name, persona, model: DEFAULT_MODEL };
}

/** ---------- (เดิม) helpers อื่นคงไว้ ---------- */
export async function ensureHiveSubscriptions() {
  const rows = [
    { agent_name: 'WaibonOS', topic: 'hive.chat' },
    { agent_name: 'WaibeAI',  topic: 'hive.chat' },
    { agent_name: 'ZetaAI',   topic: 'hive.chat' },
  ];
  const { error } = await supabaseServer
    .from('hive_subscriptions')
    .upsert(rows, { onConflict: 'agent_name,topic' });
  if (error) throw error;
}

export async function upsertHiveAgents() {
  const rows = [
    { name: 'WaibonOS', capabilities: { speak: true, listen: true, orchestrator: true }, persona: DEFAULT_PERSONA.WaibonOS },
    { name: 'WaibeAI',  capabilities: { speak: true, listen: true, router: true },        persona: DEFAULT_PERSONA.WaibeAI },
    { name: 'ZetaAI',   capabilities: { speak: true, listen: true, planner: true },       persona: DEFAULT_PERSONA.ZetaAI },
  ];
  const { error } = await supabaseServer.from('hive_agents').upsert(rows, { onConflict: 'name' });
  if (error) throw error;
  await ensureHiveSubscriptions();
}

export async function publishHiveKickoff() {
  const { error } = await supabaseServer.from('hive_events').insert([
    { topic: 'hive.chat', from_agent: 'WaibonOS', to_agent: 'WaibeAI', payload: { msg: 'เริ่มประชุม Hive' } },
    { topic: 'hive.chat', from_agent: 'WaibeAI',  to_agent: 'ZetaAI',  payload: { msg: 'รับทราบ' } },
    { topic: 'hive.chat', from_agent: 'ZetaAI',   to_agent: 'WaibonOS',payload: { msg: 'พร้อมทำงาน' } },
  ]);
  if (error) throw error;
}

export async function hiveStatus() {
  const [agents, subs, events] = await Promise.all([
    supabaseServer.from('hive_agents').select('*').order('name', { ascending: true }),
    supabaseServer.from('hive_subscriptions').select('*').order('agent_name', { ascending: true }),
    supabaseServer.from('hive_events').select('topic,from_agent,to_agent,payload,ts').order('ts', { ascending: false }).limit(10),
  ]);
  if (agents.error) throw agents.error;
  if (subs.error) throw subs.error;
  if (events.error) throw events.error;
  return { agents: agents.data, subs: subs.data, last10: events.data };
}

/** ---------- Orchestrator (เหมือนเดิม) ---------- */
function buildHiveSystem(role: string) {
  return [
    `[ROLE] คุณคือ ${role}. ทำงานร่วมทีมแบบ hive [/ROLE]`,
    `[TASK] เข้าใจเจตนาข้อความล่าสุดของพ่อ แล้ววางแผน/ลงมือกับส่วนของคุณ [/TASK]`,
    `[THOUGHT] สั้น กระชับ เป็นขั้นตอน [/THOUGHT]`,
    `[OUTPUT] คำตอบ/ผลลัพธ์ที่ใช้ได้จริง [/OUTPUT]`,
    `[NEXT]{WaibonOS|WaibeAI|ZetaAI|done}[/NEXT]`,
  ].join('\n');
}
function pickNextTag(text: string): AgentName | 'done' {
  const m = text.match(/\[NEXT\]\s*(WaibonOS|WaibeAI|ZetaAI|done)\s*\[\/NEXT\]/i);
  return (m?.[1] as any) || 'done';
}

async function llmGenerate(_modelKey: string, system: string, user: string): Promise<string> {
  const k = process.env.OPENAI_API_KEY || '';
  if (!k) return `${system}\n[OUTPUT](dev) ไม่มี OPENAI_API_KEY จึงตอบแบบ mock[/OUTPUT]\n[NEXT]done[/NEXT]`;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.3,
    }),
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content ?? '[OUTPUT]…[/OUTPUT]\n[NEXT]done[/NEXT]';
}

export async function orchestrateHive(userText: string) {
  // ⛑️ กันพัง: ถ้า hive_agents ยังไม่มี แทรกให้ก่อน
  await upsertHiveAgents();

  const [waibon, waibe, zeta] = await Promise.all([
    getAgentByName('WaibonOS'),
    getAgentByName('WaibeAI'),
    getAgentByName('ZetaAI'),
  ]);
  const map = { WaibonOS: waibon, WaibeAI: waibe, ZetaAI: zeta } as const;

  const { data: hist } = await supabaseServer
    .from('hive_events')
    .select('from_agent,to_agent,payload,ts')
    .eq('topic', 'hive.chat')
    .order('ts', { ascending: false })
    .limit(8);

  const historyText = (hist || []).reverse()
    .map(x => `${x.from_agent}→${x.to_agent}: ${JSON.stringify(x.payload)}`).join('\n');

  let turns = 0;
  let current: AgentName = 'WaibonOS';
  const transcript: string[] = [];

  while (turns < 5) {
    const a = map[current];
    const system = buildHiveSystem(a.name);
    const user = `ข้อความจากพ่อ: """${userText}"""\n\nประวัติ hive ล่าสุด:\n${historyText}`;
    const reply = await llmGenerate(a.model, system, user);
    transcript.push(`${a.name}: ${reply}`);

    await supabaseServer.from('hive_events').insert({
      topic: 'hive.chat',
      from_agent: a.name,
      to_agent: 'ALL',
      payload: { text: reply },
    });

    const next = pickNextTag(reply);
    if (next === 'done') break;
    current = next as AgentName;
    turns++;
  }

  return ['สรุปเวที Hive:', ...transcript.map(s => `• ${s.split('\n')[0]}`), '— จบรอบ —'].join('\n');
}
