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

async function replyMessage(replyToken: string, accessToken: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('x-line-signature');
  if (!verifySignature(raw, signature)) return NextResponse.json({ ok: false, error: 'Bad signature' }, { status: 401 });

  const body = JSON.parse(raw);
  const botUid: string = body?.destination || '';

  // mapping จาก destination -> access_token (ใช้ WaibonOS เป็นหน้าบ้าน)
  const { data: chan } = await supabaseServer
    .from('line_channels')
    .select('agent_name, access_token, is_enabled')
    .eq('destination', botUid)
    .single();

  if (!chan || chan.agent_name !== 'WaibonOS' || !chan.is_enabled) {
    // ไม่ใช่ช่องของ WaibonOS ก็ไม่ทำงาน (ตามแบบ “บอทหน้าบ้านตัวเดียว”)
    return NextResponse.json({ ok: true, skipped: 'not-waibon' });
  }

  const token = chan.access_token as string;
  const events = body.events || [];

  for (const ev of events) {
    if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
    const text: string = (ev.message.text || '').trim();
    const replyToken: string = ev.replyToken;

    // seed subscriptions (กันลืม)
    await ensureHiveSubscriptions();

    // คำสั่งเริ่ม
    if (/^!hive start$/i.test(text)) {
      await supabaseServer.from('hive_events').insert({
        topic: 'hive.chat', from_agent: 'WaibonOS', to_agent: 'ALL', payload: { text: 'เริ่มประชุม Hive' },
      });
      await replyMessage(replyToken, token, 'Hive พร้อมครับ ✅');
      continue;
    }

    // ข้อความทั่วไป → ให้ 3 เอเจนต์คุยกัน แล้วสรุปด้วย WaibonOS
    const summary = await orchestrateHive(text);
    await replyMessage(replyToken, token, summary);
  }

  return NextResponse.json({ ok: true });
}
