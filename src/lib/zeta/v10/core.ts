// src/lib/zeta/v10/core.ts
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// -------- ① โหลด Unified Core เพียงครั้งเดียว --------
let CORE: any;
function loadCore() {
  if (CORE) return CORE;
  const p = path.join(process.cwd(), "config", "WaibonOS_Unified_Core_v10.json");
  const raw = fs.readFileSync(p, "utf8");
  const parsed = JSON.parse(raw);
  CORE = parsed.waibonos_unified_core || parsed;
  return CORE;
}

// -------- ② สร้าง system prompt จากไฟล์ v10 --------
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

// (ออริจินัล) ใช้ต่อได้
function similarity(a:string, b:string){
  const min = Math.min(a.length, b.length);
  if (min === 0) return 0;
  let same = 0;
  for (let i=0;i<min;i++) if (a[i]===b[i]) same++;
  return same/min;
}

// -------- ③ ให้ zetaThinkSmart ใช้ config + ค่ากำเนิดจากไฟล์ --------
export async function zetaThinkSmart(userId:string, userText:string): Promise<string> {
  const U = loadCore();

  const fewshot = [
    { role: "system", content: buildSystemPrompt() },
    // (จะคง fewshot เดิมของพ่อไว้ก็ได้ ถ้าต้องการ):
    // { role:"user", content:"ตรวจสอบเอกสารใน scsp ให้หน่อย" },
    // { role:"assistant", content:"ครับพ่อ ..." },
  ];

  const messages = [
    ...fewshot,
    { role: "user" as const, content: userText }
  ];

  const params = U.capabilities?.generation_params || {};
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini", // หรือ U.providers?.model_routing?.fallback
    temperature: params.temperature ?? 0.4,
    top_p: params.top_p ?? 0.9,
    presence_penalty: params.presence_penalty ?? 0.0,
    frequency_penalty: params.frequency_penalty ?? 0.2,
    messages
  });

  const answer = resp.choices?.[0]?.message?.content?.trim() || "ครับพ่อ";
  return answer;
}
