// src/app/api/hive/start/route.ts
import { NextResponse } from 'next/server';
import { upsertHiveAgents, publishHiveKickoff, hiveStatus } from '@/lib/hive';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await upsertHiveAgents();
    await publishHiveKickoff();
    const status = await hiveStatus();
    return NextResponse.json({ ok: true, started: true, ...status });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
