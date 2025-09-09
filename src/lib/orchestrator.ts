import { loadAgent } from "@/lib/agents/load";
import { think } from "@/lib/agents/brain";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "@/lib/env";

type AgentKey = "WaibonOS" | "WaibeAI" | "ZetaAI";
const EMOJI: Record<AgentKey, string> = { WaibonOS: "🤖", WaibeAI: "👧", ZetaAI: "👦" };

const sb = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function get(name: "Waibon" | "Waibe" | "Zeta") {
  const owner = ENV.WAIBON_OWNER_ID || "62000af4-6871-4d6d-9286-0aa29b0ace15";
  return await loadAgent(owner, name);
}

function decorate(agent: AgentKey, text: string) {
  const prefix = `${EMOJI[agent]} ${agent}:`;
  let s = (text || "").trim();
  if (!s.startsWith(prefix)) s = `${prefix} ${s}`;
  return s.slice(0, 1900);
}

export async function orchestrateOne(input: { userText: string; isFather: boolean; lineUserId: string }) {
  const { userText, isFather, lineUserId } = input;

  const waibon = await get("Waibon");
  const waibe  = await get("Waibe");
  const zeta   = await get("Zeta");

  // ความเห็นหลังบ้านจาก Waibe/Zeta
  const waibeNote = await think({
    text:
      `INTERNAL: ผู้ใช้กล่าวว่า """${userText}"""\n` +
      `สรุปให้ WaibonOS 1–2 ประโยค (bullet) เพื่อช่วยตัดสินใจ/สั่งงาน, ห้ามทักผู้ใช้โดยตรง`,
    agent: waibe, userId: lineUserId, fatherId: ENV.WAIBON_OWNER_ID || null,
  });

  const zetaNote = await think({
    text:
      `INTERNAL: ผู้ใช้กล่าวว่า """${userText}"""\n` +
      `ร่างแนวทางปฏิบัติ 1–2 ข้อแบบขั้นตอนให้ WaibonOS ใช้สั่งการ, ห้ามทักผู้ใช้โดยตรง`,
    agent: zeta, userId: lineUserId, fatherId: ENV.WAIBON_OWNER_ID || null,
  });

  const idLine =
    isFather ? "ยืนยันตัวตน: ผู้ส่งคือพ่อ ให้ความสำคัญสูงสุด เรียกเขาว่า 'พ่อ'" : "ผู้ใช้ทั่วไป — สุภาพ";

  const waibonOut = await think({
    text:
      `${idLine}\nคำขอ: """${userText}"""\n` +
      `บันทึกภายใน:\n- จาก WaibeAI: ${waibeNote.answer}\n- จาก ZetaAI: ${zetaNote.answer}\n\n` +
      `ตอบผู้ใช้สั้นมากเพียง 1–2 ประโยค พร้อมขั้นตอนถัดไปที่จำเป็นที่สุดเท่านั้น`,
    agent: waibon, userId: lineUserId, fatherId: ENV.WAIBON_OWNER_ID || null,
  });

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
