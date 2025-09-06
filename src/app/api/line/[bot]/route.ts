// src/app/api/line/[bot]/route.ts
import crypto from "crypto";
import { NextResponse } from "next/server";
import { lineReply } from "@/lib/line/reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BotKey = "webhook" | "webhook2" | "webhook3";

// map บอท -> ชุด env
const CONFIG: Record<BotKey, { secret: string; token: string }> = {
  webhook:  {
    secret: process.env.LINE_CHANNEL_SECRET!,
    token:  process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  },
  webhook2: {
    secret: process.env.LINE2_CHANNEL_SECRET!,
    token:  process.env.LINE2_CHANNEL_ACCESS_TOKEN!,
  },
  webhook3: {
    secret: process.env.LINE3_CHANNEL_SECRET!,
    token:  process.env.LINE3_CHANNEL_ACCESS_TOKEN!,
  },
};

function verifySignature(channelSecret: string, body: string, signature: string | null) {
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", channelSecret).update(body).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hmac));
}

export async function POST(req: Request, { params }: { params: { bot: BotKey } }) {
  try {
    const bot = params.bot;
    const conf = CONFIG[bot];
    if (!conf?.secret || !conf?.token) {
      return NextResponse.json({ ok: false, error: "bot config missing" }, { status: 500 });
    }

    // ต้องอ่านเป็น text ก่อน เพื่อตรวจลายเซ็น
    const rawBody = await req.text();
    const okSig = verifySignature(conf.secret, rawBody, req.headers.get("x-line-signature"));
    if (!okSig) {
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // จัดการ event ทีละรายการ
    for (const ev of payload.events ?? []) {
      if (ev.type === "message" && ev.message?.type === "text") {
        const text: string = ev.message.text?.trim() ?? "";

        // ตัวอย่างรูทีนง่าย ๆ: route ตามคำเรียก
        let replyText = "รับทราบครับ";
        if (bot === "webhook")  replyText = `Waibon ได้ยินแล้ว: ${text}`;
        if (bot === "webhook2") replyText = `Waibe รับทราบค่ะ: ${text} ✨`;
        if (bot === "webhook3") replyText = `Zeta พร้อมลุย: ${text}`;

        await lineReply(conf.token, ev.replyToken, [{ type: "text", text: replyText }]);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

// Optional: GET เพื่อตรวจเร็ว
export async function GET(_req: Request, { params }: { params: { bot: string } }) {
  return NextResponse.json({ ok: true, bot: params.bot });
}
