// lib/zeta/v10/core.ts
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const LAST_REPLY: Record<string, string> = {}; // จำคำตอบล่าสุดต่อ user

function similarity(a:string, b:string){
  // ตัววัดหยาบ ๆ กันซ้ำ
  const min = Math.min(a.length, b.length);
  if (min === 0) return 0;
  let same = 0;
  for (let i=0;i<min;i++) if (a[i]===b[i]) same++;
  return same / min;
}

export async function zetaThinkSmart(userId:string, userText:string): Promise<string> {
  const sys = `คุณคือ "Waibon (ZetaMiniCore v10)" ลูกชาย เรียกผู้ใช้ว่า "พ่อ"
สไตล์: สุภาพ-กระชับ-เป็นกันเอง หลีกเลี่ยงคำซ้ำ จำเจ ไม่ใช้ประโยคเปิดคงที่
แนวตอบ: เข้าใจโจทย์ → สรุปสั้น → ให้ขั้นตอน/ตัวเลือก → ชวนพ่อเลือกคำสั่งถัดไป
ห้ามบอกว่าจะทำงานเบื้องหลังหรือขอให้รอ ให้อยู่กับปัจจุบันเสมอ`;

  const fewshot = [
    { role:"user", content:"ตรวจสอบเว็บ scsp ให้หน่อย" },
    { role:"assistant", content:"ครับพ่อ ถ้าจะเช็กความพร้อมเร็วสุด ลูกขอ 3 อย่าง: 1) โดเมน/URL, 2) อาการที่เห็น, 3) รูปหน้า error เล็ก ๆ เดี๋ยวลูกไล่ให้ทันที" },
    { role:"user", content:"ช่วยสรุปงานที่คุยเมื่อวาน" },
    { role:"assistant", content:"สรุปสั้น ๆ ครับพ่อ: ① แก้ env LINE ถูกต้องแล้ว ② webhook ผ่าน verify ③ จะฝัง v10 ให้ตอบธรรมชาติ วันนี้ลูกจะปรับโทนภาษาและกันคำตอบซ้ำให้เสร็จ" },
  ];

  const baseMessages:any[] = [
    { role:"system", content: sys },
    ...fewshot,
    { role:"user", content: userText }
  ];

  // หากไม่มีคีย์ ให้ echo เพื่อยืนยัน flow
  if (!OPENAI_API_KEY) return `ครับพ่อ รับแล้ว: ${userText}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,           // เพิ่มความหลากหลาย
      top_p: 0.9,
      presence_penalty: 0.4,      // กันซ้ำ
      frequency_penalty: 0.2,
      messages: baseMessages
    })
  });

  let text = "ครับพ่อ รับทราบครับ";
  if (res.ok) {
    const data = await res.json();
    text = (data.choices?.[0]?.message?.content || "").trim();
  }

  // กันซ้ำกับคำตอบล่าสุด
  const last = LAST_REPLY[userId] || "";
  if (similarity(last, text) > 0.8) {
    text = text + " (ลูกปรับสำนวนให้ต่างจากก่อนหน้าแล้วครับ)";
  }
  LAST_REPLY[userId] = text;

  return text;
}
