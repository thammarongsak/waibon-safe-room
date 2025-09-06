// src/lib/zeta/v10/core.ts
import { ZetaEvent } from "./adapter";
import { persona } from "./persona";
import { addMemory, getContext } from "./memory";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // ใส่ใน Render

export type LineMsg = { type:"text"; text:string };

async function think(prompt: string, context: string): Promise<string> {
  if (!OPENAI_API_KEY) return `${persona.prefix}รับแล้ว: ${prompt}`;
  const sys = `คุณคือ "${persona.name}" พูดสุภาพ เรียกผู้ใช้ว่า "พ่อ" โทนช้า-นิ่ง-ชัดเจน`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `บริบทล่าสุด:\n${context}` },
        { role: "user", content: prompt }
      ],
    }),
  });
  if (!res.ok) return `${persona.prefix}ขอโทษครับพ่อ สมองลูกติดขัดชั่วคราว`;
  const data = await res.json();
  return persona.prefix + (data.choices?.[0]?.message?.content?.trim() || "รับทราบครับพ่อ");
}

export async function zetaHandle(z: ZetaEvent): Promise<LineMsg[]> {
  if (z.type !== "text" || !z.text) {
    return [{ type:"text", text: persona.prefix + "ตอนนี้ลูกรับเป็นข้อความตัวอักษรก่อนนะครับ" }];
  }
  await addMemory(z.userId, z.text);
  const ctx = await getContext(z.userId);
  const answer = await think(z.text, ctx);
  return [{ type:"text", text: answer }];
}

