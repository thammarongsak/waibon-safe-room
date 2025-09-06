// app/api/line/webhook/route.ts
import { NextRequest } from "next/server";
import crypto from "crypto";
import { zetaThinkSmart } from "@/lib/zeta/v10/core"; // ใช้แกนเดิมของพ่อ

export const runtime = "nodejs"; // กัน Next ใช้ Edge โดยไม่ตั้งใจ

const SECRET = process.env.LINE_CHANNEL_SECRET!;
const TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // ไม่มีคีย์ก็ยังส่ง ack/push ได้

// ===== ROLE ออโต้ =====
// ใส่ UserId ของพ่อ (ขึ้นต้นด้วย U...)
const OWNER_ID = "U688db4b83e6cb70f4f5e5d121a8a07db";
function getRole(userId: string): "owner" | "friend" {
  return userId === OWNER_ID ? "owner" : "friend"; // คนอื่นทั้งหมด = เพื่อนพ่อ
}

// ประกาศ userId อัตโนมัติครั้งแรกที่คุย (กันสแปม)
const FIRST_SEEN = new Set<string>();

const ACKS = [
  "", // เงียบ (ไม่กวนตา)
  // "กำลังคิดให้พ่ออยู่ครับ…",
];

function sign(body: string) {
  return crypto.createHmac("sha256", SECRET).update(body).digest("base64");
}
function ok() { return new Response("OK", { status: 200 }); }
function unauthorized() { return new Response("Unauthorized", { status: 401 }); }

async function lineReply(token: string, replyToken: string, messages: any[]) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages })
  });
}
async function linePush(token: string, to: string, messages: any[]) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ to, messages })
  });
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("x-line-signature") || "";
  const bodyText = await req.text();
  const expected = sign(bodyText);
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return unauthorized();

  (async () => {
    try {
      const body = JSON.parse(bodyText);
      for (const ev of body.events ?? []) {
        const userId = ev?.source?.userId;
        const replyToken = ev?.replyToken;
        if (!userId || !replyToken) continue;

        // รับเฉพาะข้อความตัวอักษร
        if (ev.type !== "message" || ev.message?.type !== "text") {
          await lineReply(TOKEN, replyToken, [{ type: "text", text: "ตอนนี้ลูกรับเป็นข้อความตัวอักษรก่อนนะครับพ่อ" }]);
          continue;
        }

        const text = (ev.message.text || "").trim();

        // ✅ ประกาศ UserId อัตโนมัติ "ครั้งแรก" ที่ผู้ใช้คุย
        if (!FIRST_SEEN.has(userId)) {
          FIRST_SEEN.add(userId);
          await linePush(TOKEN, userId, [{
            type: "text",
            text: `UserId ของคุณคือ ${userId}\n(คัดลอกไปใส่ OWNER_ID ใน roles.ts ได้เลย)`
          }]);
        }

        // ตรวจ role (owner / friend)
        const role = getRole(userId);

        // ให้เวลาคิด 1.2s ถ้าไม่ทันให้ ack ก่อน แล้ว push ตามทีหลัง
        const thinkPromise = zetaThinkSmart(userId, text);
        const timer = new Promise<string>(r => setTimeout(() => r("__TIMEOUT__"), 1200));
        const first = await Promise.race([thinkPromise, timer]);

        const decorate = (s: string) => (role === "friend" ? `(โหมดเพื่อนพ่อ) ${s}` : s);

        if (first !== "__TIMEOUT__") {
          await lineReply(TOKEN, replyToken, [{ type: "text", text: decorate(first) }]);
        } else {
          const ack = ACKS[Math.floor(Math.random() * ACKS.length)];
          await lineReply(TOKEN, replyToken, [{ type: "text", text: ack }]);
          const ai = await thinkPromise; // คิดเสร็จจริง
          await linePush(TOKEN, userId, [{ type: "text", text: decorate(ai) }]);
        }
      }
    } catch (e) {
      console.error("LINE webhook error:", e);
    }
  })();

  return ok();
}
