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

async function replyLINE(replyToken: string, accessToken: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
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

  // อ่านช่องจาก DB
  const { data: chan } = await supabaseServer
    .from('line_channels')
    .select('agent_name, access_token, is_enabled')
    .eq('destination', botUid)
    .maybeSingle();

  if (!chan || !chan.is_enabled) {
    return NextResponse.json({ ok:true, skipped:'channel-not-enabled' });
  }
  const accessToken = String(chan.access_token || '');
  const events = body.events || [];

  await ensureHiveSubscriptions();

  for (const ev of events) {
    if (ev.type !== 'message' || ev.message?.type !== 'text') continue;

    const text: string = String(ev.message.text || '').trim();
    const replyToken: string = ev.replyToken;
    const userUid: string = ev?.source?.userId || 'unknown';

    if (!text) {
      await replyLINE(replyToken, accessToken, '…');
      continue;
    }

    try {
      // orchestrate ให้ทีมคิดก่อน ได้เป็น "บรรทัด" ทีละเอเจนต์
      const scripted = await orchestrateHive(text, userUid);
      // แยกเป็นบรรทัด (ข้าม header/ footer ถ้าไม่อยากส่ง)
      const lines = scripted.split('\n').filter(Boolean);

      // ตอบทันทีบรรทัดแรกด้วย reply API (เร็วไว้ก่อน)
      await replyLINE(replyToken, accessToken, lines[0]);

      // ที่เหลือให้ route push-seq ส่งต่อแบบมีดีเลย์ (ไม่บล็อกการตอบ)
      const rest = lines.slice(1);
      if (rest.length > 0) {
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/line/push-seq`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken,
            to: userUid,
            lines: rest,
            delayMs: 900,     // ปรับได้ 600–1200 เพื่อความเป็นธรรมชาติ
          }),
        }).catch(() => {});
      }
    } catch (e: any) {
      await replyLINE(replyToken, accessToken, `ขออภัย ระบบ hive มีปัญหา: ${e?.message || e}`);
    }
  }

  // ตอบกลับ LINE ให้จบ request
  return NextResponse.json({ ok: true });
}
