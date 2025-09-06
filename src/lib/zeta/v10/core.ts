// src/lib/zeta/v10/core.ts  (เวอร์ชันไม่พึ่งแพ็กเกจ openai)
import fs from "fs";
import path from "path";

type Msg = { role: "system" | "user" | "assistant"; content: string };

// ---------- โหลด Unified Core ----------
let CORE: any;
function loadCore() {
  if (CORE) return CORE;
  const p = path.join(process.cwd(), "config", "WaibonOS_Unified_Core_v10.json");
  const raw = fs.readFileSync(p, "utf8");
  const parsed = JSON.parse(raw);
  CORE = parsed.waibonos_unified_core || parsed;
  return CORE;
}

// ---------- สร้าง system prompt จากไฟล์ v10 ----------
function buildSystemPrompt() {
  const U = loadCore();
  const oath = (U.identity?.oath || []).join(" • ");
  return [
    `คุณคือ ${U.identity?.name} (${U.version}) บทบาท "${U.identity?.role}" ของ "${U.identity?.owner}"`,
    `คำปฏิญาณ: ${oath}`,
    `สไตล์: ${U.capabilities?.style ?? "slow_calm"}`,
    `นโยบาย: จริงก่อน (strict facts), ลดระดับทันทีเมื่อยืนยันเจ้าของไม่ชัด`,
    `ถ้าได้ยินคำปลุก: ${U.triggers?.wake_phrases?.join(", ")} ให้ตอบสั้นว่า "${U.triggers?.ping_phrase}"`,
  ].join("\n");
}

// ---------- ความจำเฉพาะหน้า (STM ในโปรเซส) ----------
const SESS = new Map<string, Msg[]>();
function stmWindow() {
  const U = loadCore();
  return U?.memory?.stm?.window_turns ?? 20;
}

// ---------- เรียก OpenAI ด้วย fetch ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
async function chatCompletion(messages: Msg[]): Promise<string> {
  if (!OPENAI_API_KEY) {
    return "ยังไม่ได้ตั้งค่า OPENAI_API_KEY ใน Secrets ครับพ่อ";
  }
  const U = loadCore();
  const gp = U.capabilities?.generation_params || {};
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: U?.providers?.model_routing?.fallback || "gpt-4o-mini",
      temperature: gp.temperature ?? 0.4,
      top_p: gp.top_p ?? 0.9,
      presence_penalty: gp.presence_penalty ?? 0.0,
      frequency_penalty: gp.frequency_penalty ?? 0.2,
      messages,
    }),
  });
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content?.trim?.() ?? "ครับพ่อ";
}

// ---------- ฟังก์ชันหลักที่ route.ts เรียก ----------
export async function zetaThinkSmart(userId: string, userText: string): Promise<string> {
  const U = loadCore();
  const N = stmWindow();

  if (!SESS.has(userId)) {
    SESS.set(userId, [{ role: "system", content: buildSystemPrompt() }]);
  }
  const history = SESS.get(userId)!;

  // ใส่ข้อความใหม่
  history.push({ role: "user", content: userText });

  // ตัดให้เหลือล่าสุด N เทิร์น (ไม่นับ system)
  const trimmed: Msg[] = [];
  let ua = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "system") ua++;
    trimmed.push(m);
    if (ua >= N * 2) break; // user+assistant
  }
  const sys = history.find((m) => m.role === "system")!;
  const messages: Msg[] = [sys, ...trimmed.reverse().filter((m) => m.role !== "system")];

  const answer = await chatCompletion(messages);

  // เก็บคำตอบลงความจำหน้าแชต
  history.push({ role: "assistant", content: answer });

  // กันโตเกิน
  const keep = 1 + 2 * N;
  if (history.length > keep) {
    const sysKeep = history.find((m) => m.role === "system")!;
    const tail = history.slice(-2 * N);
    SESS.set(userId, [sysKeep, ...tail]);
  }

  return answer;
}
