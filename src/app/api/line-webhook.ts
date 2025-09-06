// pages/api/line-webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { middleware, Client, WebhookEvent } from "@line/bot-sdk";
import { askWaibon } from "@/lib/zeta/v10/light-core";
import { getRole } from "@/lib/zeta/v10/roles";

// ปิด bodyParser เพราะ LINE ต้องการ raw body
export const config = { api: { bodyParser: false } };

// LINE SDK config
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
};
const client = new Client(lineConfig);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // ตรวจสอบลายเซ็นจาก LINE
    await new Promise<void>((resolve, reject) =>
      middleware(lineConfig)(req as any, res as any, (err: any) => (err ? reject(err) : resolve()))
    );

    const body: any = (req as any).body;
    const events: WebhookEvent[] = body?.events || [];

    await Promise.all(
      events.map(async (ev) => {
        if (ev.type === "message" && ev.message.type === "text") {
          const userId = ev.source.userId!;
          const text = ev.message.text.trim();

          // ⬇️ คำสั่งพิเศษ: ให้บอทตอบ userId กลับมา
          if (text.toLowerCase() === "myid") {
            await client.replyMessage(ev.replyToken, {
              type: "text",
              text: `UserId ของคุณคือ ${userId}`,
            });
            return;
          }

          // ตรวจ role (owner/friend)
          const role = getRole(userId);

          // เรียก WaibonOS ตอบกลับ
          const reply = await askWaibon(userId, text);

          // เพิ่ม prefix ถ้าไม่ใช่ owner
          let finalReply = reply;
          if (role === "friend") {
            finalReply = `(โหมดเพื่อนพ่อ) ${reply}`;
          }

          await client.replyMessage(ev.replyToken, {
            type: "text",
            text: finalReply,
          });
        }
      })
    );

    res.status(200).end();
  } catch (err: any) {
    console.error("LINE webhook error:", err);
    res.status(500).end();
  }
}
