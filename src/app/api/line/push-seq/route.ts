// src/app/api/line/push-seq/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function pushLINE(accessToken: string, to: string, text: string) {
  // ใช้ push API (ไม่ต้องมี replyToken)
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
}

export async function POST(req: Request) {
  try {
    const { accessToken, to, lines, delayMs = 900 } = await req.json();

    if (!accessToken || !to || !Array.isArray(lines)) {
      return NextResponse.json({ ok:false, error:'bad payload' }, { status:400 });
    }

    // ปลอดภัย: จำกัดจำนวนบรรทัด/ความยาวคร่าว ๆ
    const messages: string[] = lines.slice(0, 15).map((s: string) => String(s).slice(0, 1900));

    for (let i = 0; i < messages.length; i++) {
      await sleep(i === 0 ? 200 : delayMs); // หน่วงเปิดวงสนทนาเล็กน้อย
      await pushLINE(accessToken, to, messages[i]);
    }

    return NextResponse.json({ ok:true, sent: messages.length });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:500 });
  }
}
