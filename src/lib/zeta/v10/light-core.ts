// lib/zeta/v10/light-core.ts
import fs from "fs";
import OpenAI from "openai";

// โหลดคอนฟิกครั้งเดียวตอนบูต
const unified = JSON.parse(
  fs.readFileSync(process.cwd()+"/config/WaibonOS_Unified_Core_v10.json","utf8")
).waibonos_unified_core;

// ความจำเฉพาะหน้าแบบเบาๆ เก็บในหน่วยความจำของโปรเซส
// (ต่อ userId) เก็บล่าสุดไม่เกิน N turns
const N = unified?.memory?.stm?.window_turns ?? 20;
const SESS = new Map<string, Array<{role:"system"|"user"|"assistant", content:string}>>();

function systemPrompt() {
  const id = unified.identity;
  const caps = unified.capabilities;
  const oath = (id.oath||[]).join(" • ");
  return [
    `คุณคือ ${id.name} (${unified.version}) บทบาท "${id.role}" ของ "${id.owner}"`,
    `คำปฏิญาณ: ${oath}`,
    `สไตล์: ${caps?.style ?? "slow_calm"}`,
    `นโยบาย: จริงก่อน (strict facts), ลดระดับทันทีเมื่อยืนยันเจ้าของไม่ชัด`,
    `ตอบไทยเป็นหลัก ถ้าผู้ใช้เปลี่ยนภาษาให้ตามนั้น`,
  ].join("\n");
}

export async function askWaibon(userId: string, userText: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // เตรียม session memory
  if (!SESS.has(userId)) {
    SESS.set(userId, [{ role: "system", content: systemPrompt() }]);
  }
  const history = SESS.get(userId)!;

  // ใส่ข้อความใหม่ของผู้ใช้
  history.push({ role: "user", content: userText });

  // ตัดให้เหลือล่าสุด N turns (นับเฉพาะ user/assistant)
  const trimmed: typeof history = [];
  let uaCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    if (r.role !== "system") uaCount++;
    trimmed.push(r);
    if (uaCount >= N * 2) break; // user+assistant
  }
  // ใส่ system กลับไปก่อนเพราะเราย้อนมาจากท้าย
  const sys = history.find((m) => m.role === "system")!;
  const messages = [sys, ...trimmed.reverse().filter((m) => m.role !== "system")];

  // เรียกโมเดล
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: unified.capabilities?.generation_params?.temperature ?? 0.4,
    top_p: unified.capabilities?.generation_params?.top_p ?? 0.9,
    presence_penalty: unified.capabilities?.generation_params?.presence_penalty ?? 0.0,
    frequency_penalty: unified.capabilities?.generation_params?.frequency_penalty ?? 0.2,
    messages,
  });

  const answer = resp.choices[0]?.message?.content?.trim() || "ครับพ่อ";

  // บันทึกคำตอบลงความจำหน้าแชต
  history.push({ role: "assistant", content: answer });
  // กันโตเกิน: คง system 1 ก้อน + ล่าสุด 2N ข้อความ
  const keep = 1 + 2 * N;
  if (history.length > keep) {
    const sysKeep = history.find((m) => m.role === "system")!;
    const tail = history.slice(-2 * N);
    SESS.set(userId, [sysKeep, ...tail]);
  }

  return answer;
}
