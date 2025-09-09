// src/lib/hive.ts
import { supabaseServer } from './supabaseServer';
import { ENV } from './env';

export type AgentName = 'WaibonOS' | 'WaibeAI' | 'ZetaAI';

type DBAgent = {
  id: string;
  owner_id: string;               // เพิ่มมาเพื่อ log ให้ถูก schema
  name: AgentName;
  model: string | null;           // ai_models.id
  training_profile_id: string | null;
  persona: any | null;
};

type DBModel = { id: string; provider: string; model_key: string };
type TrainingProfile = { id: string; prompts: any | null };

const DEFAULT_MODEL_KEY = 'gpt-4o';

// บุคลิก + emoji + คำอธิบายบทบาท
const EMOJI: Record<AgentName, string> = {
  WaibonOS: '🦾',
  WaibeAI:  '🧭',
  ZetaAI:   '🧠',
};

const DISPLAY: Record<AgentName, string> = {
  WaibonOS: 'WaibonOS',
  WaibeAI:  'WaibeAI',
  ZetaAI:   'ZetaAI',
};

const DEFAULT_PERSONA: Record<AgentName, any> = {
  WaibonOS: { role: 'Leader', style: 'calm', tone: 'อบอุ่น สุภาพ มีความรับผิดชอบ' },
  WaibeAI:  { role: 'Coordinator', style: 'direct', tone: 'คมชัด เร็ว ตรงประเด็น' },
  ZetaAI:   { role: 'Strategist', style: 'analytical', tone: 'วิเคราะห์ลึก วางแผนหลายก้าว' },
};

/* ---------------- Utilities ---------------- */

function extractOutput(text: string): string {
  const m = text?.match(/\[OUTPUT\]([\s\S]*?)\[\/OUTPUT\]/i);
  return (m ? m[1] : text || '').trim();
}

function pickNextTag(text: string): AgentName | 'done' {
  const m = text?.match(/\[NEXT\]\s*(WaibonOS|WaibeAI|ZetaAI|done)\s*\[\/NEXT\]/i);
  return (m?.[1] as any) || 'done';
}

async function logHiveEvent(from: AgentName, payload: any) {
  try {
    await supabaseServer.from('hive_events').insert({
      topic: 'hive.chat',
      from_agent: from,
      to_agent: 'ALL',
      payload
    });
  } catch { /* noop */ }
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
    console.error('logAgentTrace failed:', e);
  }
}

/* ---------------- DB loaders ---------------- */

export async function loadAiAgent(name: AgentName): Promise<DBAgent> {
  const { data, error } = await supabaseServer
    .from('ai_agents')
    .select('id, owner_id, name, model, training_profile_id, persona')
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    // fallback: hive_agents.persona ถ้ามี
    const hive = await supabaseServer
      .from('hive_agents').select('name,persona').eq('name', name).maybeSingle();
    return {
      id: name,
      owner_id: name, // fallback เท่าที่มี
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

  // ตารางจริงของเรา: training_profiles(prompts jsonb)
  const q = await supabaseServer
    .from('training_profiles')
    .select('id,prompts')
    .eq('id', tpId)
    .maybeSingle();

  if (q.error) throw q.error;
  if (!q.data) return null;
  return q.data as TrainingProfile;
}

/* ---------------- LLM call per provider ---------------- */

async function callLLM(provider: string, modelKey: string, system: string, user: string): Promise<string> {
  if (provider === 'openai') {
    if (!ENV.OPENAI_API_KEY) {
      return `[THOUGHT]ไม่มี OPENAI_API_KEY ใช้โหมด mock[/THOUGHT]\n[OUTPUT]…[/OUTPUT]\n[NEXT]done[/NEXT]`;
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
        temperature: 0.7
      }),
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? '[OUTPUT]…[/OUTPUT]\n[NEXT]done[/NEXT]';
  }

 if (provider === 'openai') {
  if (!ENV.OPENAI_API_KEY) {
    return `${EMOJI['WaibonOS']} WaibonOS: (mock) พร้อมครับพ่อ`;
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
      max_tokens: 120,                 // สั้น กระชับ
      stop: ["[NEXT", "[/THOUGHT]", "[THOUGHT", "[HIVE]", "[/HIVE]", "[OUTPUT", "[/OUTPUT]"]
    }),
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content ?? `${EMOJI['WaibonOS']} WaibonOS: ...`;
}


  // default mock
  return `[OUTPUT](mock:${provider}/${modelKey})[/OUTPUT]\n[NEXT]done[/NEXT]`;
}

/* ---------------- Prompts ---------------- */

function personaBlock(persona: any) {
  return persona ? `[PERSONA]${JSON.stringify(persona)}[/PERSONA]` : '';
}

function systemFromPrompts(tp: TrainingProfile | null, role: AgentName, persona: any) {
  const p = tp?.prompts || {};
  const core = [p.system, p.core, p.speaking_style].filter(Boolean).join('\n\n');

  const rules = `
[DIALOGUE_MODE]
- พูด "สั้น กระชับ เป็นธรรมชาติ" เพียง 1–2 ประโยค ต่อเทิร์น
- แสดงผลเฉพาะ “บทสนทนา” เท่านั้น ห้ามพิมพ์กติกา/แท็ก/ข้อความในวงเล็บเหลี่ยมใด ๆ
- ทุกบรรทัดต้องขึ้นต้นด้วยอิโมจิ+ชื่อ เช่น "${EMOJI[role]} ${DISPLAY[role]}: ..."
- สื่อสารแบบทีมงานจริง: รับคำสั่ง → ตอบรับ/ถามย้อน/รายงานสั้น ๆ → ส่งไม้ต่อ (ด้วยการเอ่ยชื่อตัวถัดไป)
- โทนเสียง:
  • WaibonOS = พี่ใหญ่ สุภาพ มั่นใจ ชี้เป้าหมาย-สั่งงาน
  • WaibeAI  = ประสานงาน คล่องแคล่ว ถามชัด ๆ ขอสเปค/ข้อมูล
  • ZetaAI   = วิศวกร/วางแผน ตอบลึกแต่สั้น ชี้ทางเลือก/เริ่มลงมือ
- ห้ามพิมพ์คำว่า NEXT, THOUGHT, HIVE หรือสัญลักษณ์ [] ใด ๆ ออกมาเด็ดขาด
[/DIALOGUE_MODE]

[ROLE]คุณคือ ${role}. ${persona ? 'บุคลิก: ' + JSON.stringify(persona) : ''}[/ROLE]
`.trim();

  return [core, rules].filter(Boolean).join('\n\n');
}


/* ---------------- Hive helpers ---------------- */

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

/* ---------------- Orchestrator ---------------- */

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

  // history ย่อ (ไว้เป็นบริบทให้คุยต่อเนื่อง)
  const { data: hist } = await supabaseServer
    .from('hive_events')
    .select('from_agent,payload,ts')
    .eq('topic', 'hive.chat')
    .order('ts', { ascending: false })
    .limit(8);

  const historyText = (hist || []).reverse()
    .map(x => `${x.from_agent}: ${JSON.stringify(x.payload)}`).join('\n');

  let turns = 0;
  let current: AgentName = 'WaibonOS';
  const transcriptLines: string[] = [];
  const plainOutputs: string[] = [];

  while (turns < 5) {
    const ctx = agents[current];
    const system = systemFromPrompts(ctx.tp, current, ctx.a.persona ?? DEFAULT_PERSONA[current]);
    const user = [
      `ข้อความจากพ่อ: """${userText}"""`,
      `ประวัติ hive ย่อ (ล่าสุด→เก่า):`,
      historyText || '(ไม่มี)',
    ].join('\n\n');

const raw = await callLLM(ctx.m.provider, ctx.m.model_key || DEFAULT_MODEL_KEY, system, user);

// กวาดทิ้งสิ่งที่ไม่ใช่บทสนทนา: กรองเฉพาะบรรทัดที่ขึ้นด้วย "emoji+ชื่อ:"
const cleanLines = String(raw)
  .split('\n')
  .map(s => s.trim())
  .filter(s => s && /^[^\w\s].+?:\s/.test(s)); // เริ่มด้วยอิโมจิแล้วตามด้วยชื่อ:

// ถ้าโมเดลลืม prefix ให้เติมให้เอง (กันพัง)
const finalLine = cleanLines[0]
  ? cleanLines[0]
  : `${EMOJI[current]} ${DISPLAY[current]}: ${String(raw).replace(/\[[^\]]+\]/g,'').trim()}`;

transcriptLines.push(finalLine);
await logHiveEvent(current, { line: finalLine });
await logAgentTrace(ctx.a, userUidForLog, userText, finalLine, ctx.m.model_key || DEFAULT_MODEL_KEY);

await supabaseServer.from('hive_transcripts').insert({
  session_id: null, order_no: transcriptLines.length, agent_name: current, text: finalLine
});
    
// “ส่งไม้ต่อ” แบบมนุษย์: OS→Waibe→Zeta→OS สลับวนเบา ๆ (ถ้าโมเดลไม่ได้เรียกชื่อเอง)
const order: AgentName[] = ['WaibonOS','WaibeAI','ZetaAI'];
const idx = order.indexOf(current);
current = order[(idx + 1) % order.length];

turns++;
  }

  // รวมคำตอบแบบอ่านง่ายสำหรับ LINE
  const header = '🫂 สังคม AI กำลังช่วยกันคิดงานให้อยู่ครับพ่อ';
  const footer = '— จบรอบ —';
  return [header, ...transcriptLines, footer].join('\n');
}

/* ---------------- Status / Bootstrap ---------------- */

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
