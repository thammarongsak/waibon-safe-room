// src/lib/hive.ts
import { supabaseServer } from './supabaseServer';
import { ENV } from './env';

/* =========================
   Types
========================= */
export type AgentName = 'WaibonOS' | 'WaibeAI' | 'ZetaAI';

type DBAgent = {
  id: string;
  owner_id: string;
  name: AgentName;
  model: string | null;                // ai_models.id
  training_profile_id: string | null;  // training_profiles.id
  persona: any | null;
};

type DBModel = { id: string; provider: string; model_key: string };
type TrainingProfile = { id: string; prompts: any | null };

const DEFAULT_MODEL_KEY = 'gpt-4o';

/* =========================
   Display / Persona / Style
========================= */
const EMOJI: Record<AgentName, string> = {
  WaibonOS: '🤖',
  WaibeAI:  '👧',
  ZetaAI:   '👦',
};

const DISPLAY: Record<AgentName, string> = {
  WaibonOS: 'WaibonOS',
  WaibeAI:  'WaibeAI',
  ZetaAI:   'ZetaAI',
};

const PRONOUN: Record<AgentName, string> = {
  WaibonOS: 'ครับ',
  WaibeAI:  'ค่ะ',
  ZetaAI:   'ครับ',
};

const DEFAULT_PERSONA: Record<AgentName, any> = {
  WaibonOS: { role: 'Leader', style: 'calm', tone: 'อบอุ่น สุภาพ มีความรับผิดชอบ' },
  WaibeAI:  { role: 'Coordinator', style: 'direct', tone: 'คมชัด เร็ว ตรงประเด็น' },
  ZetaAI:   { role: 'Strategist', style: 'analytical', tone: 'วิเคราะห์ลึก วางแผนหลายก้าว' },
};

/* =========================
   Utilities
========================= */
function stripTags(s: string) {
  return String(s || '').replace(/\[[^\]]*]/g, '').trim();
}

function ensurePrefixAndPronoun(agent: AgentName, text: string) {
  let s = stripTags(text);
  // เติมคำลงท้าย (ครับ/ค่ะ) หากขาด
  const pron = PRONOUN[agent];
  const hasPron = new RegExp(`\\b${pron}[.!?…]*$`).test(s);
  if (!hasPron && s.length) s = `${s} ${pron}`;
  // เติม prefix emoji+ชื่อ ถ้าขาด
  const prefix = `${EMOJI[agent]} ${DISPLAY[agent]}:`;
  if (!s.startsWith(prefix)) s = `${prefix} ${s}`;
  return s;
}

/* =========================
   DB Loaders
========================= */
export async function loadAiAgent(name: AgentName): Promise<DBAgent> {
  const { data, error } = await supabaseServer
    .from('ai_agents')
    .select('id, owner_id, name, model, training_profile_id, persona')
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    const hive = await supabaseServer
      .from('hive_agents')
      .select('name, persona')
      .eq('name', name)
      .maybeSingle();
    return {
      id: name,
      owner_id: name,
      name,
      model: null,
      training_profile_id: null,
      persona: hive.data?.persona ?? DEFAULT_PERSONA[name],
    };
  }
  return {
    id: data.id,
    owner_id: (data as any).owner_id,
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
  const { data, error } = await supabaseServer
    .from('training_profiles')
    .select('id,prompts')
    .eq('id', tpId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as TrainingProfile;
}

/* =========================
   Logging
========================= */
async function logHiveEvent(from: AgentName, payload: any) {
  try {
    await supabaseServer.from('hive_events').insert({
      topic: 'hive.chat',
      from_agent: from,
      to_agent: 'ALL',
      payload,
    });
  } catch (e) {
    // no-op
  }
}

async function logAgentTrace(agent: DBAgent, userUid: string, input: string, output: string, model: string) {
  try {
    await supabaseServer.from('agent_logs').insert({
      owner_id: agent.owner_id,
      agent_id: agent.id,
      agent_name: agent.name,
      channel: 'line',
      user_uid: userUid,
      input_text: input,
      output_text: output,
      model,
      ok: true,
    });
  } catch (e) {
    // keep silent
  }
}

/* =========================
   LLM Callers
========================= */
async function callLLM(provider: string, modelKey: string, system: string, user: string): Promise<string> {
  if (provider === 'openai') {
    if (!ENV.OPENAI_API_KEY) {
      return `${EMOJI['WaibonOS']} WaibonOS: (mock) พร้อมช่วยพ่อเลยครับ`;
    }
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelKey || DEFAULT_MODEL_KEY,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.8,
        max_tokens: 120,
        stop: ['[', ']', 'THOUGHT', 'HIVE', 'OUTPUT', 'NEXT'], // กันแท็ก
      }),
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? `${EMOJI['WaibonOS']} WaibonOS: ...ครับ`;
  }

  if (provider === 'groq') {
    if (!ENV.LLAMA_API_KEY) {
      return `${EMOJI['WaibonOS']} WaibonOS: (mock-groq) พร้อมครับพ่อ`;
    }
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.LLAMA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelKey,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.8,
        max_tokens: 120,
        stop: ['[', ']', 'THOUGHT', 'HIVE', 'OUTPUT', 'NEXT'],
      }),
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? `${EMOJI['WaibonOS']} WaibonOS: ...ครับ`;
  }

  // default mock
  return `${EMOJI['WaibonOS']} WaibonOS: (mock:${provider}/${modelKey}) ครับ`;
}

/* =========================
   Prompt Builder
========================= */
function systemFromPrompts(tp: TrainingProfile | null, role: AgentName, persona: any) {
  const p = tp?.prompts || {};
  const core = [p.system, p.core, p.speaking_style].filter(Boolean).join('\n\n');

  const rules = `
[DIALOGUE_MODE]
- สนทนาเป็นธรรมชาติ ไม่มีแท็ก/วงเล็บพิเศษ (ห้ามพิมพ์ THOUGHT/NEXT/OUTPUT/HIVE).
- ตอบสั้น 1–2 ประโยค ต่อเทิร์น เหมือนคุยในแชท
- ทุกบรรทัดขึ้นต้นด้วย "อิโมจิ+ชื่อ" เช่น "${EMOJI[role]} ${DISPLAY[role]}: ..."
- ใช้สรรพนามให้ถูกตัว: WaibonOS/ ZetaAI ลงท้าย "ครับ", WaibeAI ลงท้าย "ค่ะ"
- พฤติกรรมทีม:
  • WaibonOS = พี่ใหญ่: รับคำสั่ง, ตั้งเป้าหมาย, สั่งงาน/ชวนคุย, สรุปเป็นระยะ
  • WaibeAI  = ประสานงาน: ขอข้อมูลสเปค/ตัวอย่าง, แตกงาน, รายงานสั้น
  • ZetaAI   = วิศวกร/วางแผน: เสนอแนวทาง/ความเสี่ยง, เริ่มร่าง/ตัวอย่างให้เห็นภาพ
- ไม่ต้องประกาศว่าจบรอบ ให้คุยอิสระตามบริบท
[/DIALOGUE_MODE]

[ROLE]คุณคือ ${role}${persona ? ' — บุคลิก: ' + JSON.stringify(persona) : ''}[/ROLE]
`.trim();

  return [core, rules].filter(Boolean).join('\n\n');
}

/* =========================
   Hive Subscriptions
========================= */
export async function ensureHiveSubscriptions() {
  const rows = [
    { agent_name: 'WaibonOS', topic: 'hive.chat' },
    { agent_name: 'WaibeAI',  topic: 'hive.chat' },
    { agent_name: 'ZetaAI',   topic: 'hive.chat' },
  ];
  await supabaseServer
    .from('hive_subscriptions')
    .upsert(rows, { onConflict: 'agent_name,topic' });
}

/* =========================
   Orchestrator (Free-form)
========================= */
export async function orchestrateHive(userText: string, userUidForLog: string) {
  await ensureHiveSubscriptions();

  const [a1, a2, a3] = await Promise.all([
    loadAiAgent('WaibonOS'),
    loadAiAgent('WaibeAI'),
    loadAiAgent('ZetaAI'),
  ]);
  const [m1, m2, m3] = await Promise.all([
    loadModel(a1.model), loadModel(a2.model), loadModel(a3.model),
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

  // ประวัติย่อให้โมเดลเห็นบริบท
  const { data: hist } = await supabaseServer
    .from('hive_events')
    .select('from_agent,payload,ts')
    .eq('topic', 'hive.chat')
    .order('ts', { ascending: false })
    .limit(8);

  let turns = 0;
  let current: AgentName = 'WaibonOS';
  const transcriptLines: string[] = [];
  const MAX_LINES = 9; // ปรับได้ตามต้องการ

  while (turns < MAX_LINES) {
    const ctx = agents[current];
    const system = systemFromPrompts(ctx.tp, current, ctx.a.persona ?? DEFAULT_PERSONA[current]);
    const user = [
      `ข้อความจากพ่อ: """${userText}"""`,
      `Timeline ล่าสุด:`,
      (hist || []).slice(-6).map(x => `${x.from_agent}: ${JSON.stringify(x.payload)}`).join('\n') || '(ว่าง)',
    ].join('\n\n');

    const raw = await callLLM(ctx.m.provider, ctx.m.model_key || DEFAULT_MODEL_KEY, system, user);

    // แยกเฉพาะบรรทัดแรก แล้วทำให้เป็นรูปแบบมาตรฐาน
    let line = String(raw || '').split('\n').map(s => s.trim()).find(Boolean) || '';
    line = ensurePrefixAndPronoun(current, line);

    transcriptLines.push(line);
    await logHiveEvent(current, { line });
    await logAgentTrace(ctx.a, userUidForLog, userText, line, ctx.m.model_key || DEFAULT_MODEL_KEY);

    // หมุนลำดับพูดแบบคนจริง (พี่→น้อง→น้อง→พี่)
    const order: AgentName[] = ['WaibonOS', 'WaibeAI', 'ZetaAI'];
    current = order[(order.indexOf(current) + 1) % order.length];
    turns++;
  }

  // คืนเป็นข้อความหลายบรรทัด (webhook จะไปแตกส่งทีละบรรทัดพร้อมดีเลย์)
  return transcriptLines.join('\n');
}

/* =========================
   Status / Bootstrap
========================= */
export async function hiveStatus() {
  const [agents, subs, events] = await Promise.all([
    supabaseServer.from('hive_agents').select('*').order('name', { ascending: true }),
    supabaseServer.from('hive_subscriptions').select('*').order('agent_name', { ascending: true }),
    supabaseServer.from('hive_events')
      .select('topic,from_agent,to_agent,payload,ts')
      .order('ts', { ascending: false })
      .limit(10),
  ]);
  if (agents.error) throw agents.error;
  if (subs.error) throw subs.error;
  if (events.error) throw events.error;
  return { agents: agents.data, subs: subs.data, last10: events.data };
}

export async function upsertHiveAgents() {
  const rows = [
    { name: 'WaibonOS', capabilities: { speak:true, listen:true, orchestrator:true }, persona: DEFAULT_PERSONA.WaibonOS },
    { name: 'WaibeAI',  capabilities: { speak:true, listen:true, router:true },        persona: DEFAULT_PERSONA.WaibeAI },
    { name: 'ZetaAI',   capabilities: { speak:true, listen:true, planner:true },       persona: DEFAULT_PERSONA.ZetaAI },
  ];
  await supabaseServer.from('hive_agents').upsert(rows, { onConflict: 'name' });
  await ensureHiveSubscriptions();
}

export async function publishHiveKickoff() {
  await supabaseServer.from('hive_events').insert([
    { topic:'hive.chat', from_agent:'WaibonOS', to_agent:'WaibeAI', payload:{ msg:'เริ่มประชุม Hive' } },
    { topic:'hive.chat', from_agent:'WaibeAI',  to_agent:'ZetaAI',  payload:{ msg:'รับทราบ' } },
    { topic:'hive.chat', from_agent:'ZetaAI',   to_agent:'WaibonOS',payload:{ msg:'พร้อมทำงาน' } },
  ]);
}
