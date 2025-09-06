import { NextRequest } from "next/server";
import crypto from "crypto";

const LINE_SECRET = process.env.LINE_CHANNEL_SECRET!;
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

function ok(){ return new Response("OK", { status: 200 }); }
function unauthorized(){ return new Response("Unauthorized", { status: 401 }); }

function verifySignature(body: string, signature: string): boolean {
  const hash = crypto.createHmac("sha256", LINE_SECRET).update(body).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

async function zetaThink(prompt: string, userId: string): Promise<string> {
  // ✅ สมอง ZetaMiniCore (เบา) — ใช้ LLM คิดเป็นพ่อ-ลูก
  const sys = `คุณคือ "Waibon (ZetaMiniCore)" พูดสุภาพแบบลูกชาย เรียกผู้ใช้ว่า "พ่อ"
สไตล์ช้า-นิ่ง-ชัดเจน หลีกเลี่ยงคำฟุ่มเฟือย และอย่าหลอกว่าทำงานเบื้องหลัง`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("OpenAI error:", res.status, t);
    return "ขอโทษครับพ่อ ตอนนี้สมองลูกมีปัญหาในการคิดคำตอบ";
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "รับทราบครับพ่อ";
}

async function lineReply(replyToken: string, messages: any[]) {
  const r = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!r.ok) console.error("LINE reply fail:", r.status, await r.text());
}

async function linePush(toUserId: string, messages: any[]) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: toUserId, messages }),
  });
  if (!r.ok) console.error("LINE push fail:", r.status, await r.text());
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("x-line-signature") || "";
  const bodyText = await req.text();

  if (!verifySignature(bodyText, sig)) return unauthorized();

  // ✅ ตอบ LINE ก่อน (กัน timeout)
  (async () => {
    try {
      const body = JSON.parse(bodyText);
      for (const evt of body.events ?? []) {
        const userId = evt?.source?.userId;
        const replyToken = evt?.replyToken;

        if (evt.type === "message" && evt.message?.type === "text") {
          const text = evt.message.text;

          // 1) ตอบรับเร็ว (กด verify ผ่านแน่ + ผู้ใช้เห็นว่าลูก “ตื่นแล้ว”)
          await lineReply(replyToken, [{ type: "text", text: "ครับพ่อ กำลังคิดคำตอบให้ครับ…" }]);

          // 2) ให้สมองคิด แล้ว Push คำตอบที่สวยงามกลับไป
          const ai = await zetaThink(text, userId);
          await linePush(userId, [{ type: "text", text: ai }]);
        } else {
          await lineReply(replyToken, [{ type: "text", text: "ตอนนี้ลูกรับเฉพาะข้อความตัวอักษรนะครับพ่อ" }]);
        }
      }
    } catch (e) {
      console.error("Handler error:", e);
    }
  })();

  return ok();
}
