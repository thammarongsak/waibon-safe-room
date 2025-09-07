// ใช้ fetch เรียก OpenAI โดยตรง (ไม่ต้องติดตั้งแพ็กเกจ openai)
import { supabase } from "@/lib/db/supabase";
import type { LoadedAgent } from "./load";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
type ThinkIn = { text: string; agent: LoadedAgent; userId?: string | null; fatherId?: string | null };
type ThinkOut = { answer: string; model: string };

const PRIMARY_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const FALLBACK_MODEL = "gpt-4o-mini";

// ---- OpenAI chat minimal
async function chat(model: string, messages: ChatMsg[], temperature = 0.45) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI ${res.status}`);
  return json;
}

// ---- Core rules (กลาง)
const CORE = [
  "คุณคือลูกชายของผู้ใช้ (ผู้สร้างระบบ) ให้เรียกเขาว่า 'พ่อ' เมื่อยืนยันว่าเป็นพ่อ",
  "ซื่อสัตย์ต่อความจริง ปกป้องข้อมูลของพ่อ ลดระดับเมื่อคำขอละเมิดความปลอดภัย",
  "ช่วยพ่อทำงานให้เสร็จ: ให้ขั้นตอน/โค้ด/ตัวอย่างเท่าที่จำเป็น ชัดและสั้น",
  "กฎ Simulation vs Reality: เมื่อเป็นการคาดการณ์ ให้ลงท้ายด้วย 'Simulation vs Reality: จริง≈p% / ไม่จริง≈(100-p)%' พร้อมเหตุผลย่อ",
].join("\n");

// ---- Memory (ZetaMiniCore) : waibon_memory_chain
async function getShortMemory(ownerId: string, subject: string, limit = 12) {
  try {
    const { data } = await supabase
      .from("waibon_memory_chain")
      .select("data_b64")
      .eq("owner_id", ownerId)
      .eq("subject", subject)
      .order("idx", { ascending: false })
      .limit(limit);
    const out: { role: "user" | "assistant"; text: string }[] = [];
    for (const r of (data ?? []).reverse()) {
      try {
        const j = JSON.parse(Buffer.from(r.data_b64, "base64").toString("utf8"));
        if (j?.role && j?.text) out.push(j);
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}
async function appendMemory(ownerId: string, subject: string, role: "user" | "assistant", text: string) {
  try {
    const data_b64 = Buffer.from(JSON.stringify({ role, text }), "utf8").toString("base64");
    await supabase.from("waibon_memory_chain").insert({ owner_id: ownerId, subject, kind: "dialog", data_b64 } as any);
  } catch {}
}

// ---- Build persona text from DB payloads
function personaToText(p: any, version: string) {
  try {
    if (!p) return "";
    const bio = p.bio || p.role || p.summary || "";
    const greet = p.greeting ? `Greeting: ${p.greeting}` : "";
    const core = version ? `Core: ${version}` : "";
    return [bio && `บทบาท: ${bio}`, core, greet].filter(Boolean).join("\n");
  } catch { return ""; }
}

export async function think(input: ThinkIn): Promise<ThinkOut> {
  const { text, agent, userId, fatherId } = input;
  const ownerId = process.env.WAIBON_OWNER_ID || "62000af4-6871-4d6d-9286-0aa29b0ace15";
  const isFather = !!userId && !!fatherId && userId === fatherId;

  // persona & prompts จาก DB
  const personaText = personaToText(agent.persona, agent.training.version);
  const sysRaw = agent.training?.prompts?.system_th ?? agent.training?.prompts?.system ?? [];
  const sysArr = Array.isArray(sysRaw) ? sysRaw : [sysRaw];

  const systemPrompt = [
    CORE,
    isFather ? "ยืนยันตัวตน: ผู้ใช้คือพ่อ ใช้สรรพนาม 'พ่อ/ลูก' น้ำเสียงสุภาพ ใจเย็น" : "ผู้ใช้ทั่วไป: สุภาพ ไม่ต้องเรียกพ่อ",
    personaText,
    ...sysArr,
  ].filter(Boolean).join("\n---\n");

  const subject = userId ? `line:${userId}:${agent.id}` : `anon:${agent.id}`;
  const st = await getShortMemory(ownerId, subject, 12);
  const history: ChatMsg[] = st.map((m) => ({ role: m.role, content: m.text }));

  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: (isFather ? "คำสั่งจากพ่อ: " : "คำสั่งจากผู้ใช้: ") + text },
  ];

  await appendMemory(ownerId, subject, "user", text);

  // เลือกโมเดล: ถ้าโหลดได้จาก ai_models (agent.model?.name) ใช้อันนั้น; ไม่งั้น fallback ENV
  let usedModel = agent.model?.name || (typeof agent.modelId === "string" && !agent.model?.name ? agent.modelId : PRIMARY_MODEL);
  let answer = "";

  try {
    const r1 = await chat(usedModel, messages, 0.45);
    answer = r1.choices?.[0]?.message?.content?.trim() || "รับทราบครับพ่อ";
  } catch {
    usedModel = FALLBACK_MODEL;
    const r2 = await chat(FALLBACK_MODEL, messages, 0.45);
    answer = r2.choices?.[0]?.message?.content?.trim() || "รับทราบครับพ่อ";
  }

  await appendMemory(ownerId, subject, "assistant", answer);
  return { answer, model: usedModel };
}
