// lib/zeta/v10/light-core.ts  (เวอร์ชันไม่พึ่งแพ็กเกจ openai)
import fs from "fs";
import { getRole } from "./roles";

const unified = JSON.parse(
  fs.readFileSync(process.cwd() + "/config/WaibonOS_Unified_Core_v10.json", "utf8")
).waibonos_unified_core;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = "gpt-4o-mini";

const N = unified?.memory?.stm?.window_turns ?? 20;
type Msg = { role: "system" | "user" | "assistant"; content: string };
const SESS = new Map<string, Msg[]>();

function systemPrompt(role: "owner" | "friend") {
  const id = unified.identity;
  const caps = unified.capabilities;
  const oath = (id.oath || []).join(" • ");
  const roleLine =
    role === "owner"
      ? "คุณคือ WaibonOS ของพ่อ (Owner Mode: full capability)."
      : "คุณคือ WaibonOS แต่ผู้ใช้นี้เป็นเพื่อนของพ่อ (Friend Mode).";
  return [
    `คุณคือ ${id.name} (${unified.version}) บทบาท "${id.role}" ของ "${id.owner}"`,
    `คำปฏิญาณ: ${oath}`,
    roleLine,
    `สไตล์: ${caps?.style ?? "slow_calm"}`,
    `นโยบาย: จริงก่อน (strict facts), ลดระดับทันทีเมื่อยืนยันเจ้าของไม่ชัด`,
  ].join("\n");
}

async function chatCompletion(messages: Msg[]): Promise<string> {
  if (!OPENAI_API_KEY) return "ยังไม่ได้ตั้งค่า OPENAI_API_KEY ใน Secrets ครับพ่อ";
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: unified.capabilities?.generation_params?.temperature ?? 0.4,
      top_p: unified.capabilities?.generation_params?.top_p ?? 0.9,
      presence_penalty:
        unified.capabilities?.generation_params?.presence_penalty ?? 0.0,
      frequency_penalty:
        unified.capabilities?.generation_params?.frequency_penalty ?? 0.2,
      messages,
    }),
  });
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content?.trim?.() ?? "ครับพ่อ";
}

export async function askWaibon(userId: string, userText: string): Promise<string> {
  const role = getRole(userId);

  if (!SESS.has(userId)) {
    SESS.set(userId, [{ role: "system", content: systemPrompt(role) }]);
  }
  const history = SESS.get(userId)!;

  history.push({ role: "user", content: userText });

  // trim ความจำล่าสุด
  const trimmed: Msg[] = [];
  let ua = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "system") ua++;
    trimmed.push(m);
    if (ua >= N * 2) break;
  }
  const sys = history.find((m) => m.role === "system")!;
  const messages: Msg[] = [sys, ...trimmed.reverse().filter((m) => m.role !== "system")];

  const answer = await chatCompletion(messages);
  history.push({ role: "assistant", content: answer });

  const keep = 1 + 2 * N;
  if (history.length > keep) {
    const sysKeep = history.find((m) => m.role === "system")!;
    const tail = history.slice(-2 * N);
    SESS.set(userId, [sysKeep, ...tail]);
  }

  return answer;
}
