// src/app/api/hive/start/route.ts
import { NextResponse } from 'next/server';
import { upsertHiveAgents, publishHiveKickoff, hiveStatus } from '@/lib/hive';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await upsertHiveAgents();
    await publishHiveKickoff();
    const s = await hiveStatus();
    return NextResponse.json({ ok: true, started: true, ...s });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
