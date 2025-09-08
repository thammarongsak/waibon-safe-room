// src/app/api/hive/status/route.ts
import { NextResponse } from 'next/server';
import { hiveStatus } from '@/lib/hive';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const s = await hiveStatus();
    return NextResponse.json({ ok: true, ...s });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
