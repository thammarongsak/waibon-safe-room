// src/lib/hive.ts
import { supabaseServer } from './supabaseServer';

type Agent = { id: string; name: 'WaibonOS'|'WaibeAI'|'ZetaAI'; persona: any; model: string };

async function getAgentByName(name: string): Promise<Agent> {
  const { data, error } = await supabaseServer
    .from('ai_agents')
    .select('id,name,model,persona')
    .eq('name', name)
    .single();
  if (error || !data) throw new Error(`agent not found: ${name}`);
  return { id: data.id, name: data.name, persona: data.persona || {}, model: data.model };
}

function buildHiveSystem(role: string) {
  return [
    `[ROLE] คุณคือ ${role}. ทำงานร่วมทีมแบบ hive [/ROLE]`,
    `[TASK] เข้าใจเจตนาข้อความล่าสุดของพ่อ แล้ววางแผน/ลงมือกับส่วนของคุณ [/TASK]`,
    `[THOUGHT] สั้น กระชับ เป็นขั้นตอน [/THOUGHT]`,
    `[OUTPUT] คำตอบ/ผลลัพธ์ที่ใช้ได้จริง [/OUTPUT]`,
    `[NEXT]{WaibonOS|WaibeAI|ZetaAI|done}[/NEXT]`,
  ].join('\n');
}

function pickNextTag(text: string): 'WaibonOS'|'WaibeAI'|'ZetaAI'|'done' {
  const m = text.match(/\[NEXT\]\s*(WaibonOS|WaibeAI|ZetaAI|done)\s*\[\/NEXT\]/i);
  return (m?.[1] as any) || 'done';
}

// ——— แกนเรียก LLM (ใช้ OPENAI_API_KEY ที่มีอยู่แล้วใน Render)
async function llmGenerate(modelKey: string, system: string, user: string): Promise<string> {
  const k = process.env.OPENAI_API_KEY || '';
  if (!k) return `${system}\n[OUTPUT] (dev) ไม่มี OPENAI_API_KEY จึงตอบแบบ mock [/OUTPUT]\n[NEXT]done[/NEXT]`;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o', // พ่อใช้ gpt-4o อยู่แล้ว
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.3,
    }),
  });
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? '[OUTPUT]…[/OUTPUT]\n[NEXT]done[/NEXT]';
}

export async function ensureHiveSubscriptions() {
  const rows = [
    { agent_name: 'WaibonOS', topic: 'hive.chat' },
    { agent_name: 'WaibeAI',  topic: 'hive.chat' },
    { agent_name: 'ZetaAI',   topic: 'hive.chat' },
  ];
  const { error } = await supabaseServer.from('hive_subscriptions').upsert(rows);
  if (error) throw error;
}

export async function orchestrateHive(userText: string) {
  // โหลด 3 เอเจนต์
  const [waibon, waibe, zeta] = await Promise.all([
    getAgentByName('WaibonOS'),
    getAgentByName('WaibeAI'),
    getAgentByName('ZetaAI'),
  ]);
  const map = { WaibonOS: waibon, WaibeAI: waibe, ZetaAI: zeta } as const;

  // ประวัติย่อ (ล่าสุด 8 เหตุการณ์ใน hive.chat)
  const { data: hist } = await supabaseServer
    .from('hive_events')
    .select('from_agent,to_agent,payload,ts')
    .eq('topic', 'hive.chat')
    .order('ts', { ascending: false })
    .limit(8);
  const historyText = (hist||[]).reverse().map(x => `${x.from_agent}→${x.to_agent}: ${JSON.stringify(x.payload)}`).join('\n');

  // วิ่ง round-robin สูงสุด 5 เทิร์น (กันลูป)
  let turns = 0;
  let current: 'WaibonOS'|'WaibeAI'|'ZetaAI' = 'WaibonOS';
  const transcript: string[] = [];

  while (turns < 5) {
    const a = map[current];
    const system = buildHiveSystem(a.name);
    const user = `ข้อความจากพ่อ: """${userText}""" \n\nประวัติการสนทนาใน hive:\n${historyText}`;
    const reply = await llmGenerate(a.model, system, user);
    transcript.push(`${a.name}: ${reply}`);

    // บันทึกลง hive_events
    await supabaseServer.from('hive_events').insert({
      topic: 'hive.chat',
      from_agent: a.name,
      to_agent: 'ALL',
      payload: { text: reply },
    });

    const next = pickNextTag(reply);
    if (next === 'done') break;
    current = next;
    turns++;
  }

  // สรุปให้ WaibonOS ส่งกลับห้อง
  const summary = [
    'สรุปเวที Hive:',
    ...transcript.map(s => `• ${s.split('\n')[0]}`),
    '— จบรอบ —',
  ].join('\n');
  return summary;
}
