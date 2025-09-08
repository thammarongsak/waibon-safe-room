// src/app/api/hive/status/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [agents, subs, events] = await Promise.all([
      supabaseServer.from('hive_agents').select('*').order('name', { ascending: true }),
      supabaseServer.from('hive_subscriptions').select('*').order('agent_name', { ascending: true }),
      supabaseServer.from('hive_events').select('topic,from_agent,to_agent,payload,ts').order('ts', { ascending: false }).limit(10),
    ]);
    if (agents.error) throw agents.error;
    if (subs.error) throw subs.error;
    if (events.error) throw events.error;
    return NextResponse.json({ ok: true, agents: agents.data, subs: subs.data, last10: events.data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
