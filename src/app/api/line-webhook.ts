// pages/api/line-webhook.ts
import { middleware, Client, WebhookEvent } from "@line/bot-sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import { askWaibon } from "@/lib/zeta/v10/light-core";

export const config = { api: { bodyParser: false } };

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
};

const client = new Client(lineConfig);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ตรวจสอบลายเซ็นจาก LINE
  await new Promise<void>((resolve, reject) =>
    middleware(lineConfig)(req as any, res as any, (e: any) => (e ? reject(e) : resolve()))
  );

  const body: any = (req as any).body;
  const events: WebhookEvent[] = body?.events || [];

  await Promise.all(
    events.map(async (ev) => {
      if (ev.type === "message" && ev.message.type === "text") {
        const userId = ev.source.userId!;
        const text = ev.message.text.trim();
        const reply = await askWaibon(userId, text);
        await client.replyMessage(ev.replyToken, { type: "text", text: reply });
      }
    })
  );

  res.status(200).end();
}
