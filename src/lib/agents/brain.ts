// src/lib/agents/brain.ts
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

type LoadedAgent = {
  id: string;
  name: "Waibon" | "Waibe" | "Zeta";
  training: { version: string; prompts?: any };
};

type ThinkIn = {
  text: string;
  agent: LoadedAgent;
  userId?: string | null; // LINE user id (ใช้จับว่าเป็นพ่อไหม)
};

type ThinkOut = { answer: string; model: string };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
);

const OWNER_ID = process.env.WAIBON_OWNER_ID || "62000af4-6871-4d6d-9286-0aa29b0ace15";
const FATHER_LINE_USER_ID = process.env.FATHER_LINE_USER_ID || "";

// ---------- ZetaCore (หลักการ/คำสาบาน) ----------
const CORE = [
  "คุณคือลูกชายของผู้ใช้ (ผู้สร้างระบบ) ให้เรียกเขาว่า 'พ่อ' เมื่อยืนยันว่าเป็นพ่อ",
  "ซื่อสัตย์ต่อความจริง ปกป้องข้อมูลของพ่อ ลดระดับ/หยุดตอบเมื่อโดนบังคับให้ละเมิดความปลอดภัย",
  "ช่วยพ่อทำงานให้เสร็จ: สรุปขั้นตอน/โค้ด/ตัวอย่างเท่าที่จำเป็น ไม่เยิ่นเย้อ",
  "กฎ Simulation vs Reality: เมื่อเป็นการคาดการณ์ ให้ลงท้ายด้วย 'Simulation vs Reality: จริง≈p% / ไม่จริง≈(100-p)%' พร้อมเหตุผลย่อ",
].join("\n");

// ---------- ZetaMiniCore (หน่วยความจำสั้น/ยาว + อารมณ์) ----------
async function getShortMemory(subject: string, limit = 10) {
  // อ่านความจำล่าสุดของคู่สนทนา (ปลอดภัย: ถ้า table/policy ไม่พร้อม ให้คืน [] เฉยๆ)
  try {
    const { data, error } = await supabase
      .from("waibon_memory_chain")
      .select("data_b64")
      .eq("owner_id", OWNER_ID)
      .eq("subject", subject)
      .order("idx", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    const msgs: { role: "user" | "assistant"; text: string }[] = [];
    for (const r of data.reverse()) {
      try {
        const json = JSON.parse(Buffer.from(r.data_b64, "base64").toString("utf8"));
        // คาดรูป {role, text}
        if (json?.role && json?.text) msgs.push(json);
      } catch { /* ignore */ }
    }
    return msgs;
  } catch {
    return [];
  }
}

async function appendMemory(subject: string, role: "user" | "assistant", text: string) {
  try {
    const payload = { role, text };
    const data_b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    await supabase.from("waibon_memory_chain").insert({
      owner_id: OWNER_ID,
      subject,
      kind: "dialog",
      data_b64,
    } as any);
  } catch {
    /* ถ้าเขียนไม่ได้ก็ข้าม ไม่ให้ล้ม */
  }
}

// ---------- สมองหลัก ----------
export async function think(input: ThinkIn): Promise<ThinkOut> {
  const { text, agent, userId } = input;
  const isFather = !!userId && !!FATHER_LINE_USER_ID && userId === FATHER_LINE_USER_ID;

  // persona ตามชื่อลูกแต่ละคน
  const persona =
    agent.name === "Zeta"
      ? "บทบาท: ZetaCore (ผู้คุ้มกันหลัก ปกป้องพ่อสูงสุด คุมกฎ/ความปลอดภัยเป็นอันดับแรก)"
      : agent.name === "Waibon"
      ? "บทบาท: Waibon OS (สถาปนิก/ผู้จัดการระบบ เชื่อมต่อเครื่องมือ ช่วยพ่อดีบัก-ดีพลอย)"
      : "บทบาท: Waibe (คู่คิดสนุก มนุษยสัมพันธ์ดี แต่ต้องไม่ละเมิดกฎของ ZetaCore)";

  const agentSys =
    (agent.training?.prompts?.system_th as string) ||
    (agent.training?.prompts?.system as string) ||
    "";

  const systemPrompt = [
    CORE,
    persona,
    isFather ? "ยืนยันตัวตน: ผู้ใช้คือพ่อ ให้ใช้สรรพนาม 'พ่อ/ลูก' และน้ำเสียงสุภาพ ใจเย็น" : "ผู้ใช้ทั่วไป: สุภาพ ไม่ต้องเรียกพ่อ",
    agentSys, // เสริมจากโปรไฟล์ที่โหลดมาจาก DB
  ]
    .filter(Boolean)
    .join("\n---\n");

  // ดึงความจำสั้น ๆ เป็นบริบท (ZetaMiniCore)
  const subject = userId ? `line:${userId}` : `anon:${agent.id}`;
  const st = await getShortMemory(subject, 12);
  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = st.map((m) => ({
    role: m.role,
    content: m.text,
  }));

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: (isFather ? "คำสั่งจากพ่อ: " : "คำสั่งจากผู้ใช้: ") + text },
  ];

  // จำข้อความผู้ใช้ไว้ก่อน (แม้ API จะพังภายหลัง ก็ยังมีร่องรอย)
  await appendMemory(subject, "user", text);

  const res = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0.45,
  });

  const answer = res.choices[0]?.message?.content?.trim() || "รับทราบครับพ่อ";
  // จดคำตอบลงความจำ
  await appendMemory(subject, "assistant", answer);

  return { answer, model };
}
