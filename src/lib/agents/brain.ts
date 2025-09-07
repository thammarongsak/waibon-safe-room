// src/lib/agents/brain.ts
type BrainInput = { text: string; agent: LoadedAgent };

export async function think({ text, agent }: BrainInput) {
  const m = agent.capabilities?.models?.[0]?.id ?? "gpt-4o";
  const sys = agent.training.prompts?.system ?? [];
  const messages = [
    ...sys.map((s: string) => ({ role: "system", content: s })),
    { role: "user", content: text },
  ];

  // ตัวอย่างใช้ OpenAI-compatible fetch (ปรับเป็น SDK ที่พ่อใช้จริงได้)
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: m, messages })
  });
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "…";
}
