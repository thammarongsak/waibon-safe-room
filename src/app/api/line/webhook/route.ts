import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!;
const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

function verifySignature(body: string, signature: string) {
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return hash === signature;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-line-signature") || "";
  const bodyText = await req.text();

  if (!verifySignature(bodyText, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const body = JSON.parse(bodyText);

  for (const event of body.events) {
    if (event.type === "message" && event.message.type === "text") {
      await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          replyToken: event.replyToken,
          messages: [{ type: "text", text: `Waibon ▶ ${event.message.text}` }],
        }),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
