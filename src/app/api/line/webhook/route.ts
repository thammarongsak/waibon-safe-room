// app/api/line/webhook/route.ts
import { NextRequest } from "next/server";
import crypto from "crypto";
import { zetaThinkSmart } from "@/lib/zeta/v10/core";   // ⬅️ ใช้ฟังก์ชันใหม่ด้านล่าง

export const runtime = "nodejs"; // กัน Next ใช้ Edge โดยไม่ตั้งใจ

const SECRET = process.env.LINE_CHANNEL_SECRET!;
const TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // ไม่มีก็ยังตอบได้

const ACKS = [
  "",
];

function sign(body:string){ return crypto.createHmac("sha256", SECRET).update(body).digest("base64"); }
function ok(){ return new Response("OK",{status:200}); }
function unauthorized(){ return new Response("Unauthorized",{status:401}); }

async function lineReply(token:string, replyToken:string, messages:any[]){
  await fetch("https://api.line.me/v2/bot/message/reply",{
    method:"POST",
    headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${token}`},
    body: JSON.stringify({ replyToken, messages })
  });
}

async function linePush(token:string, to:string, messages:any[]){
  await fetch("https://api.line.me/v2/bot/message/push",{
    method:"POST",
    headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${token}`},
    body: JSON.stringify({ to, messages })
  });
}

export async function POST(req: NextRequest){
  const sig = req.headers.get("x-line-signature") || "";
  const bodyText = await req.text();
  const expected = sign(bodyText);
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return unauthorized();

  (async ()=>{
    const body = JSON.parse(bodyText);
    for (const ev of body.events ?? []) {
      const userId = ev?.source?.userId;
      const replyToken = ev?.replyToken;
      if (!userId || !replyToken) continue;

      if (ev.type === "message" && ev.message?.type === "text") {
        const text = ev.message.text;

        // ให้เวลาคิด 1.2s ถ้าไม่ทันค่อยส่ง ack แล้ว push ตาม
        const thinkPromise = zetaThinkSmart(userId, text);
        const timer = new Promise<string>(r => setTimeout(() => r("__TIMEOUT__"), 1200));
        const first = await Promise.race([thinkPromise, timer]);

        if (first !== "__TIMEOUT__") {
          // ตอบฉลาดทีเดียว (ไม่ล็อคแพทเทิร์น)
          await lineReply(TOKEN, replyToken, [{ type:"text", text: first }]);
        } else {
          const ack = ACKS[Math.floor(Math.random()*ACKS.length)];
          await lineReply(TOKEN, replyToken, [{ type:"text", text: ack }]);
          const ai = await thinkPromise; // คิดเสร็จจริง
          await linePush(TOKEN, userId, [{ type:"text", text: ai }]);
        }

      } else {
        await lineReply(TOKEN, replyToken, [{ type:"text", text:"ตอนนี้ลูกรับเป็นข้อความตัวอักษรก่อนนะครับพ่อ" }]);
      }
    }
  })();

  return ok();
}
