// src/lib/hive.ts
import { supabaseServer } from './supabaseServer';

export async function upsertHiveAgents() {
  const agents = [
    {
      name: 'WaibonOS',
      capabilities: { speak: true, listen: true, orchestrator: true },
      persona: { role: 'leader', style: 'calm' },
    },
    {
      name: 'WaibeAI',
      capabilities: { speak: true, listen: true, router: true },
      persona: { role: 'coordinator', style: 'direct' },
    },
    {
      name: 'ZetaAI',
      capabilities: { speak: true, listen: true, planner: true },
      persona: { role: 'strategist', style: 'analytical' },
    },
  ];

  for (const a of agents) {
    const { error } = await supabaseServer
      .from('hive_agents')
      .upsert({ name: a.name, capabilities: a.capabilities, persona: a.persona });
    if (error) throw error;
  }

  // subscribe ทุกตัวเข้าห้องกลาง hive.chat
  for (const a of agents) {
    const { error } = await supabaseServer
      .from('hive_subscriptions')
      .upsert({ agent_name: a.name, topic: 'hive.chat' });
    if (error) throw error;
  }
}

export async function publishHiveKickoff() {
  const chain = [
    { topic: 'hive.chat', from_agent: 'WaibonOS', to_agent: 'WaibeAI', msg: 'เริ่มประชุม Hive' },
    { topic: 'hive.chat', from_agent: 'WaibeAI',  to_agent: 'ZetaAI',  msg: 'รับทราบ' },
    { topic: 'hive.chat', from_agent: 'ZetaAI',   to_agent: 'WaibonOS', msg: 'พร้อมทำงาน' },
  ];

  for (const e of chain) {
    const { error } = await supabaseServer.from('hive_events').insert({
      topic: e.topic,
      from_agent: e.from_agent,
      to_agent: e.to_agent,
      payload: { msg: e.msg },
    });
    if (error) throw error;
  }
}

export async function hiveStatus() {
  const [{ data: agents, error: e1 }, { data: subs, error: e2 }, { data: last10, error: e3 }] =
    await Promise.all([
      supabaseServer.from('hive_agents').select('*').order('name', { ascending: true }),
      supabaseServer.from('hive_subscriptions').select('*').order('agent_name', { ascending: true }),
      supabaseServer
        .from('hive_events')
        .select('topic,from_agent,to_agent,payload,ts')
        .order('ts', { ascending: false })
        .limit(10),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  return { agents, subs, last10 };
}
