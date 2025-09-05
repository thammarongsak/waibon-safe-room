import { NextRequest, NextResponse } from "next/server";
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

  // ✅ ตอบกลับทันทีเพื่อให้ Verify ผ่าน
  if (!verifySignature(bodyText, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }
  // LINE ต้องการแค่ 200 OK
  const res = new Response("OK", { status: 200 });

  // ✅ ทำงาน async ต่อ (ไม่บล็อก response)
  (async () => {
    try {
      const body = JSON.parse(bodyText);
      for (const evt of body.events ?? []) {
        if (evt.type === "message" && evt.message.type === "text") {
          await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              replyToken: evt.replyToken,
              messages: [{ type: "text", text: `รับแล้ว: ${evt.message.text}` }],
            }),
          });
        }
      }
    } catch (err) {
      console.error("LINE handler error", err);
    }
  })();

  return res;
}
