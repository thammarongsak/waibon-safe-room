// src/lib/zeta/v10/adapter.ts
export type ZetaEvent = {
  userId: string;
  type: "text" | "other";
  text?: string;
  replyToken: string;
};

export function toZetaEvent(ev: any): ZetaEvent | null {
  const userId = ev?.source?.userId;
  const replyToken = ev?.replyToken;
  if (!userId || !replyToken) return null;

  if (ev.type === "message" && ev.message?.type === "text") {
    return { userId, type: "text", text: ev.message.text, replyToken };
  }
  return { userId, type: "other", replyToken };
}

