// src/app/api/line/webhook/route.ts
import { NextResponse } from 'next/server';
import { publishHiveKickoff, upsertHiveAgents } from '@/lib/hive';
import { ENV } from '@/lib/env';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function verifySignature(body: string, signature: string | null) {
  if (!ENV.LINE_CHANNEL_SECRET) return true; // ไม่มี SECRET ก็ข้าม (ใช้ตอน dev)
  if (!signature) return false;
  const h = crypto.createHmac('sha256', ENV.LINE_CHANNEL_SECRET).update(body).digest('base64');
  return h === signature;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('x-line-signature');

  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ ok: false, error: 'Bad signature' }, { status: 401 });
  }

  try {
    const body = JSON.parse(raw);
    const events = body.events || [];
    for (const ev of events) {
      const text = ev?.message?.text?.trim?.() || '';
      if (text === '!hive start') {
        await upsertHiveAgents();
        await publishHiveKickoff();
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
