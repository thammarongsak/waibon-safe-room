// src/app/api/line/webhook/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { ENV } from '@/lib/env';
import { orchestrateHive, ensureHiveSubscriptions } from '@/lib/hive';

export const dynamic = 'force-dynamic';

// --- verify LINE signature (ถ้ามี) ---
function verifySignature(body: string, signature: string | null) {
  if (!ENV.LINE_CHANNEL_SECRET) return true; // dev mode (ไม่มี secret ก็ข้าม)
  if (!signature) return false;
  const h = crypto.createHmac('sha256', ENV.LINE_CHANNEL_SECRET).update(body).digest('base64');
  return h === signature;
}

// --- LINE reply ---
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
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ ok: false, error: 'Bad signature' }, { status: 401 });
  }

  const body = JSON.parse(raw);
  const botUid: string = body?.destination || '';

  // ใช้เฉพาะช่องของ WaibonOS เป็น “หน้าบ้าน”
  const { data: chan } = await supabaseServer
    .from('line_channels')
    .select('agent_name, access_token, is_enabled')
    .eq('destination', botUid)
    .single();

  if (!chan || chan.agent_name !== 'WaibonOS' || !chan.is_enabled) {
    return NextResponse.json({ ok: true, skipped: 'not-waibon' });
  }

  const token = chan.access_token as string;
  const events = body.events || [];

  // ให้มี subscription ครบเสมอ
  await ensureHiveSubscriptions();

  for (const ev of events) {
    if (ev.type !== 'message' || ev.message?.type !== 'text') continue;

    const text: string = String(ev.message.text || '').trim();
    const replyToken: string = ev.replyToken;

    // กันข้อความว่าง/สติ๊กเกอร์/ภาพ
    if (!text) {
      await replyMessage(replyToken, token, '…');
      continue;
    }

    // ALWAYS orchestrate: พิมพ์อะไรก็ให้ 3 เอเจนต์คุยกัน แล้ว WaibonOS สรุป
    // (ไม่มีเงื่อนไข !hive start อีกต่อไป)
    const summary = await orchestrateHive(text);

    // ตอบกลับห้องเดียวด้วย WaibonOS
    await replyMessage(replyToken, token, summary);
  }

  return NextResponse.json({ ok: true });
}
