// src/app/api/line/webhook/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { ENV } from '@/lib/env';
import { orchestrateHive, ensureHiveSubscriptions } from '@/lib/hive';

export const dynamic = 'force-dynamic';

function verifySignature(body: string, signature: string | null) {
  if (!ENV.LINE_CHANNEL_SECRET) return true; // dev mode
  if (!signature) return false;
  const h = crypto.createHmac('sha256', ENV.LINE_CHANNEL_SECRET).update(body).digest('base64');
  return h === signature;
}

async function replyChunked(replyToken: string, accessToken: string, text: string) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 900) chunks.push(text.slice(i, i + 900));
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      replyToken,
      messages: chunks.map(t => ({ type: 'text', text: t })),
    }),
  });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('x-line-signature');
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ ok:false, error:'Bad signature' }, { status:401 });
  }

  const body = JSON.parse(raw);
  const botUid: string = body?.destination || '';

  // อ่านช่องจาก DB (ไม่ล็อกเฉพาะ WaibonOS)
  const { data: chan } = await supabaseServer
    .from('line_channels')
    .select('agent_name, access_token, is_enabled')
    .eq('destination', botUid)
    .maybeSingle();

  if (!chan || !chan.is_enabled) {
    return NextResponse.json({ ok:true, skipped:'channel-not-enabled' });
  }
  const token = String(chan.access_token || '');

  const events = body.events || [];
  await ensureHiveSubscriptions();

  for (const ev of events) {
    if (ev.type !== 'message' || ev.message?.type !== 'text') continue;

    const text: string = String(ev.message.text || '').trim();
    const replyToken: string = ev.replyToken;
    const userUid: string = ev?.source?.userId || 'unknown';

    if (!text) {
      await replyChunked(replyToken, token, '…');
      continue;
    }

    try {
      // ส่ง userUid เข้าไปเพื่อให้ agent_logs ถูกต้อง
      const summary = await orchestrateHive(text, userUid);
      await replyChunked(replyToken, token, summary);
    } catch (e: any) {
      await replyChunked(replyToken, token, `ขออภัย ระบบ hive มีปัญหา: ${e?.message || e}`);
    }
  }

  return NextResponse.json({ ok: true });
}
