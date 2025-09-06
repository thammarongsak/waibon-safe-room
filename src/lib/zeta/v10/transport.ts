// src/lib/zeta/v10/transport.ts
export async function lineReply(token: string, replyToken: string, messages: any[]){
  const r = await fetch("https://api.line.me/v2/bot/message/reply",{
    method:"POST",
    headers:{ "Content-Type":"application/json","Authorization":`Bearer ${token}`},
    body: JSON.stringify({ replyToken, messages })
  });
  if (!r.ok) console.error("LINE reply fail:", r.status, await r.text());
}

export async function linePush(token: string, to: string, messages: any[]){
  const r = await fetch("https://api.line.me/v2/bot/message/push",{
    method:"POST",
    headers:{ "Content-Type":"application/json","Authorization":`Bearer ${token}`},
    body: JSON.stringify({ to, messages })
  });
  if (!r.ok) console.error("LINE push fail:", r.status, await r.text());
}

