// src/lib/hive.ts
import { supabaseServer } from './supabaseServer';

/** ===== types ===== */
type AgentName = 'WaibonOS' | 'WaibeAI' | 'ZetaAI';

type DBAgent = {
  id: string;
  name: AgentName;
  model: string | null;                // ai_models.id (uuid)
  training_profile_id: string | null;  // training profile uuid
  persona: any | null;
};

type DBModel = {
  id: string;
  provider: 'openai' | 'groq' | 'anthropic' | string;
  model_key: string; // เช่น gpt-4o, gpt-4o-mini ฯลฯ
};

type TrainingProfile = {
  id: string;
  content: string; // system prompt/การฝึก
};

const DEFAULT_MODEL_KEY = 'gpt-4o';
const DEFAULT_PERSONA: Record<AgentName, any> = {
  WaibonOS: { role: 'leader', style: 'calm' },
  WaibeAI:  { role: 'coordinator', style: 'direct' },
  ZetaAI:   { role: 'strategist', style: 'analytical' },
};

/** ===== DB helpers ===== */
async function loadAiAgent(name: AgentName): Promise<DBAgent> {
  const { data, error } = await supabaseServer
    .from('ai_agents')
    .select('id,name,model,training_profile_id,persona')
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`agent not found in ai_agents: ${name}`);
  return {
    id: data.id,
    name: data.name,
    model: data.model ?? null,
    training_profile_id: data.training_profile_id ?? null,
    persona: data.persona ?? DEFAULT_PERSONA[name],
  };
}

async function loadModel(modelId: string | null): Promise<DBModel> {
  if (!modelId) return { id: 'nil', provider: 'openai', model_key: DEFAULT_MODEL_KEY };
  const { data, error } = await supabaseServer
    .from('ai_models')
    .select('id,provider,model_key')
    .eq('id', modelId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { id: 'nil', provider: 'openai', model_key: DEFAULT_MODEL_KEY };
  return data as DBModel;
}

async function loadTrainingProfile(tpId: string | null): Promise<TrainingProfile | null> {
  if (!tpId) return null;
  // ลองสองตารางที่พบในงานพ่อ
  let q = await supabaseServer
    .from('training_profiles')
    .select('id,content')
    .eq('id', tpId)
    .maybeSingle();
  if (q.data) return q.data as TrainingProfile;

  q = await supabaseServer
    .from('ai_training_profiles')
    .select('id,content')
    .eq('id', tpId)
    .maybeSingle();
  if (q.data) return q.data as TrainingProfile;

  return null;
}

/** ===== LLM call ตาม provider ===== */
async function callProviderLLM(provider: string, modelKey: string, system: string, user: string): Promise<string> {
  if (provider === 'openai') {
    const k = process.env.OPENAI_API_KEY || '';
    if (!k) return `[THOUGHT]ไม่มี OPENAI_API_KEY ใช้โหมด mock[/THOUGHT]\n[OUTPUT]…[/OUTPUT]\n[NEXT]done[/NEXT]`;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelKey || DEFAULT_MODEL_KEY,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3,
      }),
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? '[OUTPUT]…[/OUTPUT]\n[NEXT]done[/NEXT]';
  }
  if (provider === 'groq') {
    const k = process.env.LLAMA_API_KEY || process.env.LLAMA3_API_KEY || '';
    if (!k) return `[THOUGHT]ไม่มี GROQ KEY ใช้ mock[/THOUGHT]\n[OUTPUT]…[/OUTPUT]\n[NEXT]done[/NEXT]`;
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelKey,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3,
      }),
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? '[OUTPUT]…[/OUTPUT]\n[NEXT]done[/NEXT]';
  }
  // default mock
  return `[OUTPUT](mock:${provider}/${modelKey})[/OUTPUT]\n[NEXT]done[/NEXT]`;
}

/** ===== Compose system จาก training + persona + hive wrapper ===== */
function buildSystem(tp: TrainingProfile | null, persona: any, roleName: AgentName) {
  const head = tp?.content ? tp.content.trim() : '';
  const personaText = persona ? `\n[PERSONA]${JSON.stringify(persona)}[/PERSONA]` : '';
  const hive = `\n[HIVE]คุณคือ ${roleName}. ทำงานร่วมทีมแบบ hive
- คิดเป็นขั้นตอนสั้น ๆ ใน [THOUGHT]
- ผลลัพธ์ใช้งานได้จริงไว้ใน [OUTPUT]
- ระบุคนต่อไปใน [NEXT]{WaibonOS|WaibeAI|ZetaAI|done}[/NEXT][/HIVE]`;
  return `${head}${personaText}${hive}`;
}

function pickNextTag(text: string): AgentName | 'done' {
  const m = text.match(/\[NEXT\]\s*(WaibonOS|WaibeAI|ZetaAI|done)\s*\[\/NEXT\]/i);
  return (m?.[1] as any) || 'done';
}

/** ===== บันทึกอีเวนต์/ลอค ===== */
async function logHiveEvent(from: string, payload: any) {
  await supabaseServer.from('hive_events').insert({
    topic: 'hive.chat',
    from_agent: from,
    to_agent: 'ALL',
    payload,
  });
}
async function logAgentTrace(agentId: string, content: string) {
  // เฉพาะถ้ามีตาราง agent_logs
  try {
    await supabaseServer.from('agent_logs').insert({
      agent_id: agentId,
      role: 'assistant',
      content,
    });
  } catch (_) {}
}

/** ===== ทำให้มี subscriptions ครบเสมอ ===== */
export async function ensureHiveSubscriptions() {
  const rows = [
    { agent_name: 'WaibonOS', topic: 'hive.chat' },
    { agent_name: 'WaibeAI',  topic: 'hive.chat' },
    { agent_name: 'ZetaAI',   topic: 'hive.chat' },
  ];
  await supabaseServer.from('hive_subscriptions').upsert(rows, { onConflict: 'agent_name,topic' });
}

/** ===== orchestrator: ใช้ AI ใน DB จริง ๆ ===== */
export async function orchestrateHive(userText: string) {
  await ensureHiveSubscriptions();

  // โหลดตัวละครจาก DB
  const [a1, a2, a3] = await Promise.all([
    loadAiAgent('WaibonOS'), loadAiAgent('WaibeAI'), loadAiAgent('ZetaAI')
  ]);

  const [m1, m2, m3] = await Promise.all([
    loadModel(a1.model), loadModel(a2.model), loadModel(a3.model)
  ]);

  const [tp1, tp2, tp3] = await Promise.all([
    loadTrainingProfile(a1.training_profile_id),
    loadTrainingProfile(a2.training_profile_id),
    loadTrainingProfile(a3.training_profile_id),
  ]);

  const agents = {
    WaibonOS: { a: a1, m: m1, tp: tp1 },
    WaibeAI:  { a: a2, m: m2, tp: tp2 },
    ZetaAI:   { a: a3, m: m3, tp: tp3 },
  } as const;

  // history สั้น ๆ
  const { data: hist } = await supabaseServer
    .from('hive_events')
    .select('from_agent,payload,ts')
    .eq('topic', 'hive.chat')
    .order('ts', { ascending: false })
    .limit(8);
  const historyText = (hist || [])
    .reverse()
    .map(x => `${x.from_agent}: ${JSON.stringify(x.payload)}`)
    .join('\n');

  // หมุนเวียนสูงสุด 5 เทิร์น
  let turns = 0;
  let current: AgentName = 'WaibonOS';
  const transcript: string[] = [];

  while (turns < 5) {
    const ctx = agents[current];
    const sys = buildSystem(ctx.tp, ctx.a.persona ?? DEFAULT_PERSONA[current], current);
    const usr = `ข้อความจากพ่อ: """${userText}"""\n\nประวัติ hive ย่อ:\n${historyText}`;

    const out = await callProviderLLM(ctx.m.provider, ctx.m.model_key || DEFAULT_MODEL_KEY, sys, usr);
    transcript.push(`${current}: ${out}`);

    await logHiveEvent(current, { text: out });
    await logAgentTrace(ctx.a.id, out);

    const next = pickNextTag(out);
    if (next === 'done') break;
    current = next;
    turns++;
  }

  const summary = ['สรุปเวที Hive:', ...transcript.map(l => `• ${l.split('\n')[0]}`), '— จบรอบ —'].join('\n');
  return summary;
}

/** ===== status (คงไว้ให้ /api/hive/status ใช้) ===== */
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
