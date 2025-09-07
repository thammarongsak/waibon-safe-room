// src/lib/line/reply.ts
export async function lineReply(token: string, replyToken: string, messages: any[]) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages })
  });
  if (!res.ok) throw new Error(`LINE reply failed ${res.status}: ${await res.text()}`);
}


//ของเก่า
// src/lib/line/reply.ts
//export async function lineReply(channelAccessToken: string, replyToken: string, messages: any[]) {
  //const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    //method: "POST",
    //headers: {
      //"Authorization": `Bearer ${channelAccessToken}`,
      //"Content-Type": "application/json",
    //},
    //body: JSON.stringify({ replyToken, messages }),
  //});
  //if (!res.ok) {
    //const text = await res.text();
    //throw new Error(`LINE reply failed: ${res.status} ${text}`);
  //}
//}
