// src/lib/line/reply.ts
export async function replyText(replyToken: string, text: string) {
  const token = process.env.LINE_TOKEN_WAIBONOS!; // ตั้งใน .env
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });
}
