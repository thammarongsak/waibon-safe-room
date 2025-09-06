// src/app/api/line/webhook3/route.ts
import { NextRequest } from "next/server";
import crypto from "crypto";
import { zetaThinkSmart } from "@/lib/zeta/v10/core";

export const runtime = "nodejs";

const SECRET = process.env.LINE_CHANNEL_SECRET!;
const TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // ไม่มีคีย์ก็ยังส่ง ack/push ได้

// ใส่ UserId ของพ่อ (ขึ้นต้นด้วย U…)
const OWNER_ID = "U688db4b83e6cb70f4f5e5d121a8a07db";

// ประกาศ userId อัตโนมัติครั้งแรก (กันสแปม)
const FIRST_SEEN = new Set<string>();
const ACKS = [""];

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

        // เฉพาะข้อความตัวอักษร
        if (ev.type !== "message" || ev.message?.type !== "text") {
          await lineReply(TOKEN, replyToken, [{ type: "text", text: "ตอนนี้ลูกรับเป็นข้อความตัวอักษรก่อนนะครับพ่อ" }]);
          continue;
        }

        const text = (ev.message.text || "").trim();

        // ประกาศ UserId ครั้งแรกที่คุย
        if (!FIRST_SEEN.has(userId)) {
          FIRST_SEEN.add(userId);
          await linePush(TOKEN, userId, [{ type: "text", text: `UserId ของคุณคือ ${userId}` }]);
        }

        // กำหนด role (พ่อ=owner, คนอื่น=friend)
        const role = userId === OWNER_ID ? "owner" : "friend";

        // ให้เวลาคิด 1.2s ถ้าไม่ทัน ส่ง ack ก่อน
        const thinkPromise = zetaThinkSmart(userId, text, role);
        const timer = new Promise<string>(r => setTimeout(() => r("__TIMEOUT__"), 1200));
        const first = await Promise.race([thinkPromise, timer]);
        const decorate = (s: string) => role === "friend" ? `(โหมดเพื่อนพ่อ) ${s}` : s;

        if (first !== "__TIMEOUT__") {
          await lineReply(TOKEN, replyToken, [{ type: "text", text: decorate(first) }]);
        } else {
          const ack = ACKS[Math.floor(Math.random() * ACKS.length)];
          await lineReply(TOKEN, replyToken, [{ type: "text", text: ack }]);
          const ai = await thinkPromise;
          await linePush(TOKEN, userId, [{ type: "text", text: decorate(ai) }]);
        }
      }
    } catch (e) {
      console.error("LINE webhook error:", e);
    }
  })();

  return ok();
}
