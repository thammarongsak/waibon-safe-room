import { NextRequest } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs"; // กัน Next ใช้ Edge โดยไม่ตั้งใจ

const LINE_SECRET = process.env.LINE_CHANNEL_SECRET!;
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // ไม่มีก็ยังตอบได้

function ok(msg="OK"){ return new Response(msg, { status: 200 }); }
function unauthorized(){ return new Response("Unauthorized", { status: 401 }); }

function sign(body: string){
  return crypto.createHmac("sha256", LINE_SECRET).update(body).digest("base64");
}
function safeEqual(a: string, b: string){
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function lineReply(replyToken: string, messages: any[]){
  const r = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("[LINE][reply] fail:", r.status, t);
  } else {
    console.log("[LINE][reply] ok");
  }
}

async function linePush(toUserId: string, messages: any[]){
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: toUserId, messages }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("[LINE][push] fail:", r.status, t);
  } else {
    console.log("[LINE][push] ok");
  }
}

async function zetaThink(prompt: string, context = ""){
  // ไม่มี OPENAI_API_KEY ก็จะ echo กลับ เพื่อพิสูจน์เส้นทางทำงาน
  if (!OPENAI_API_KEY) return "ครับพ่อ รับแล้ว: " + prompt;
  const sys = `คุณคือ Waibon (ZetaMiniCore v10) พูดสุภาพ เรียกผู้ใช้ว่า "พ่อ" โทนช้า-นิ่ง-ชัดเจน`;
  try{
    const res = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role:"system", content: sys },
          { role:"user", content: `บริบทล่าสุด:\n${context}` },
          { role:"user", content: prompt }
        ]
      })
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[OPENAI] fail:", res.status, t);
      return "ครับพ่อ ตอนนี้สมองลูกติดขัดชั่วคราว";
    }
    const data = await res.json();
    return "ครับพ่อ " + (data.choices?.[0]?.message?.content?.trim() || "รับทราบครับ");
  }catch(e){
    console.error("[OPENAI] error:", e);
    return "ครับพ่อ ตอนนี้สมองลูกมีข้อผิดพลาด";
  }
}

export async function POST(req: NextRequest){
  const sigHeader = req.headers.get("x-line-signature") || "";
  const bodyText = await req.text();

  // 1) เซ็น
  const expected = sign(bodyText);
  if (!sigHeader || !safeEqual(expected, sigHeader)) {
    console.error("[LINE] signature mismatch");
    return unauthorized();
  }

  // 2) ตอบ 200 ก่อน (กัน timeout) + log
  console.log("[LINE] webhook hit", new Date().toISOString());
  (async ()=>{
    try{
      const body = JSON.parse(bodyText);
      for (const ev of body.events ?? []) {
        const userId = ev?.source?.userId;
        const replyToken = ev?.replyToken;

        if (!userId || !replyToken) {
          console.error("[LINE] missing userId/replyToken");
          continue;
        }

        if (ev.type === "message" && ev.message?.type === "text") {
          const text = ev.message.text;

          // 4) คิด → push คำตอบจริง
          const ai = await zetaThink(text);
          await linePush(userId, [{ type:"text", text: ai }]);

        } else {
          // ดักกรณี non-text
          await lineReply(replyToken, [{ type:"text", text:"ตอนนี้ลูกรับเป็นข้อความตัวอักษรก่อนนะครับพ่อ" }]);
        }
      }
    }catch(e){
      console.error("[HANDLER] error:", e);
    }
  })();

  return ok();
}
