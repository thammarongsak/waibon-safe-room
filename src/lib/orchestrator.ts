//src/lib/orchestrator.ts
import { loadAgent } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";
import { createClient } from "@supabase/supabase-js";

type AgentKey = "WaibonOS" | "WaibeAI" | "ZetaAI";

const EMOJI: Record<AgentKey, string> = { WaibonOS: "🤖", WaibeAI: "👧", ZetaAI: "👦" };
const DISPLAY: Record<AgentKey, string> = { WaibonOS: "WaibonOS", WaibeAI: "WaibeAI", ZetaAI: "ZetaAI" };
const PRONOUN: Record<AgentKey, string> = { WaibonOS: "ครับ", WaibeAI: "ค่ะ", ZetaAI: "ครับ" };

function decorate(agent: AgentKey, text: string) {
  const pron = PRONOUN[agent];
  let s = String(text || "").trim();
  if (s && !new RegExp(`\\b${pron}[.!?…]*$`).test(s)) s = `${s} ${pron}`;
  const prefix = `${EMOJI[agent]} ${DISPLAY[agent]}:`;
  if (!s.startsWith(prefix)) s = `${prefix} ${s}`;
  return s.slice(0, 1900);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// โหลด agent ของเจ้าของ (พ่อ)
async function get(agentName: "Waibon" | "Waibe" | "Zeta") {
  const owner = process.env.WAIBON_OWNER_ID || "62000af4-6871-4d6d-9286-0aa29b0ace15";
  return await loadAgent(owner, agentName);
}

export async function orchestrateOne(input: { userText: string; isFather: boolean; lineUserId: string }) {
  const { userText, isFather, lineUserId } = input;

  // โหลด 3 ตัว
  const waibon = await get("Waibon");
  const waibe  = await get("Waibe");
  const zeta   = await get("Zeta");

  // ===== Phase A: ขอความเห็น "หลังบ้าน" จาก Waibe/Zeta (ไม่ส่งให้ผู้ใช้โดยตรง)
  const waibeNote = await think({
    text:
      `INTERNAL: ผู้ใช้พิมพ์ว่า """${userText}"""\n` +
      `สรุปให้พี่ WaibonOS 1–2 ประโยคแบบ bullet ที่ช่วยให้ตัดสินใจ/สั่งงานได้เร็วที่สุด ` +
      `(ห้ามทักผู้ใช้โดยตรง, ห้ามลงท้ายด้วยอีโมจิ, ไทยล้วน)`,
    agent: waibe,
    userId: lineUserId,
    fatherId: process.env.WAIBON_OWNER_ID || null,
  });

  const zetaNote = await think({
    text:
      `INTERNAL: ผู้ใช้พิมพ์ว่า """${userText}"""\n` +
      `ร่าง "แนวทางปฏิบัติ" สั้นมาก 1–2 ข้อ (เชิงเทคนิค/ขั้นตอน) ให้ WaibonOS ใช้สั่งทีมต่อ ` +
      `(ห้ามทักผู้ใช้โดยตรง, ไทยล้วน)`,
    agent: zeta,
    userId: lineUserId,
    fatherId: process.env.WAIBON_OWNER_ID || null,
  });

  // ===== Phase B: ให้ WaibonOS ตอบผู้ใช้ “เพียง 1–2 ประโยค” สรุปรวม
  const fatherLine =
    isFather
      ? "ยืนยันตัวตน: ผู้ส่งข้อความคือพ่อ — ให้เรียกเขาว่า 'พ่อ' และให้ความสำคัญสูงสุด"
      : "ผู้ใช้ทั่วไป — สุภาพ ไม่เปิดเผยข้อมูลภายใน";

  const waibonOut = await think({
    text:
      `${fatherLine}\n` +
      `คำขอจากผู้ใช้: """${userText}"""\n` +
      `บันทึกทีม (ภายใน):\n` +
      `- จาก WaibeAI: ${waibeNote.answer}\n` +
      `- จาก ZetaAI: ${zetaNote.answer}\n\n` +
      `จงตอบผู้ใช้สั้นมากเพียง 1–2 ประโยค, ตรงงาน, บอกขั้นตอนถัดไปที่จำเป็นที่สุดเท่านั้น.`,
    agent: waibon,
    userId: lineUserId,
    fatherId: process.env.WAIBON_OWNER_ID || null,
  });

  // log เบา ๆ (ถ้ามีตาราง agent_logs)
  try {
    await sb.from("agent_logs").insert({
      owner_id: waibon.id,
      agent_id: waibon.id,
      agent_name: "WaibonOS",
      channel: "line",
      user_uid: lineUserId,
      input_text: userText,
      output_text: waibonOut.answer,
      model: waibon.model?.name || "gpt-4o-mini",
      ok: true,
    });
  } catch {}

  return decorate("WaibonOS", waibonOut.answer || "รับทราบครับพ่อ");
}
