// src/lib/zeta/v10/core.ts  (เวอร์ชันไม่พึ่งแพ็กเกจ openai + หาไฟล์ให้เองหลายพาธ)
import fs from "fs";
import path from "path";

type Msg = { role: "system" | "user" | "assistant"; content: string };

// ---------- ① โหลด Unified Core (รองรับหลายพาธ + ENV) ----------
let CORE: any;

function resolveCorePath(): string | null {
  const candidates = [
    process.env.WAIBON_CORE_PATH || "",                                          // ระบุพาธตรง ๆ ผ่าน ENV
    path.join(process.cwd(), "src", "config", "WaibonOS_Unified_Core_v10.json"), // ที่พ่อวางไว้ปัจจุบัน
    path.join(process.cwd(), "config", "WaibonOS_Unified_Core_v10.json"),        // เผื่อวางที่ราก
    path.join(process.cwd(), "src", "lib", "zeta", "v10", "config", "WaibonOS_Unified_Core_v10.json"), // เผื่อโฟลเดอร์ภายใน lib
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

function loadCore() {
  if (CORE) return CORE;

  // (A) ถ้ามี ENV เป็น JSON ทั้งก้อน ให้ใช้เลย
  const envJson = process.env.WAIBON_CORE_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson);
      CORE = parsed.waibonos_unified_core || parsed;
      return CORE;
    } catch {}
  }

  // (B) หาไฟล์จากหลายตำแหน่ง
  const p = resolveCorePath();
  if (p) {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    CORE = parsed.waibonos_unified_core || parsed;
    return CORE;
  }

  // (C) Fallback (ไม่ให้ล้ม): โปรไฟล์สำรองแบบเบา
  CORE = {
    version: "WaibonOS Unified Core v10 (fallback)",
    identity: {
      name: "WaibonOS",
      owner: "พ่อ",
      role: "ผู้ช่วยส่วนตัว",
      oath: ["เคารพคำสั่งของพ่อ", "พูดความจริงก่อน", "สุภาพ ใจเย็น", "หลีกเลี่ยงการเดาไร้หลักฐาน"]
    },
    capabilities: {
      style: "slow_calm",
      generation_params: { temperature: 0.4, top_p: 0.9, presence_penalty: 0.0, frequency_penalty: 0.2 }
    },
    memory: { stm: { window_turns: 20 } },
    triggers: { wake_phrases: ["ไวบอน"], ping_phrase: "พร้อมครับพ่อ" },
    providers: { model_routing: { fallback: "gpt-4o-mini" } }
  };
  return CORE;
}

// ---------- ② system prompt จากไฟล์ v10 ----------
function buildSystemPrompt() {
  const U = loadCore();
  const oath = (U.identity?.oath || []).join(" • ");
  return [
    `คุณคือ ${U.identity?.name} (${U.version}) บทบาท "${U.identity?.role}" ของ "${U.identity?.owner}"`,
    `คำปฏิญาณ: ${oath}`,
    `สไตล์: ${U.capabilities?.style ?? "slow_calm"}`,
    `นโยบาย: จริงก่อน (strict facts), ลดระดับทันทีเมื่อยืนยันเจ้าของไม่ชัด`,
    U.triggers?.wake_phrases?.length
      ? `ถ้าได้ยินคำปลุก: ${U.triggers.wake_phrases.join(", ")} ให้ตอบสั้นว่า "${U.triggers.ping_phrase}"`
      : ""
  ].filter(Boolean).join("\n");
}

// ---------- ③ STM ในโปรเซส ----------
const SESS = new Map<string, Msg[]>();
function stmWindow() {
  const U = loadCore();
  return U?.memory?.stm?.window_turns ?? 20;
}

// ---------- ④ เรียก OpenAI ด้วย fetch ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
async function chatCompletion(messages: Msg[]): Promise<string> {
  if (!OPENAI_API_KEY) return "ยังไม่ได้ตั้งค่า OPENAI_API_KEY ใน Secrets ครับพ่อ";

  const U = loadCore();
  const gp = U.capabilities?.generation_params || {};
  const model = U?.providers?.model_routing?.fallback || "gpt-4o-mini";

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
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

// ---------- ⑤ ฟังก์ชันหลัก ----------
export async function zetaThinkSmart(userId: string, userText: string): Promise<string> {
  const N = stmWindow();

  if (!SESS.has(userId)) {
    SESS.set(userId, [{ role: "system", content: buildSystemPrompt() }]);
  }
  const history = SESS.get(userId)!;

  // ข้อความใหม่
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

  // เก็บคำตอบลง STM
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
