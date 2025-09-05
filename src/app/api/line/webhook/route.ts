import { NextRequest } from "next/server";
import crypto from "crypto";

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!;
const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

function verifySignature(body: string, signature: string): boolean {
  const hash = crypto.createHmac("sha256", CHANNEL_SECRET).update(body).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-line-signature") || "";
  const bodyText = await req.text();

  // ตรวจ signature
  if (!verifySignature(bodyText, signature)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ✅ ตอบกลับ LINE ก่อนทันที
  const res = new Response("OK", { status: 200 });

  // ✅ ประมวลผลแบบ async ต่อ
  (async () => {
    try {
      const body = JSON.parse(bodyText);

      for (const evt of body.events ?? []) {
        if (evt.type === "message" && evt.message.type === "text") {
          const text = evt.message.text;

          const reply = await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              replyToken: evt.replyToken,
              messages: [{ type: "text", text: `รับแล้ว: ${text}` }],
            }),
          });

          if (!reply.ok) {
            const errMsg = await reply.text();
            console.error("LINE Reply Fail:", reply.status, errMsg);
          }
        } else {
          // ตอบกรณีไม่ใช่ข้อความ
          await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              replyToken: evt.replyToken,
              messages: [{ type: "text", text: "บอทรับได้แต่ข้อความตัวอักษรครับ" }],
            }),
          });
        }
      }
    } catch (err) {
      console.error("Handler error:", err);
    }
  })();

  return res;
}
