import type { LoadedAgent } from "./load";

type BrainInput = { text: string; agent: LoadedAgent };

function pickModel(agent: LoadedAgent): string {
  // ลำดับความสำคัญ: capabilities.models[0] > agent.modelId > default
  const capModel = agent.capabilities?.models?.[0]?.id;
  return capModel || agent.modelId || "gpt-4o";
}

export async function think({ text, agent }: BrainInput) {
  const model = pickModel(agent);
  const sys = (agent.training?.prompts?.system ?? []) as string[];

  const messages = [
    ...sys.map((s) => ({ role: "system", content: s })),
    { role: "user", content: text }
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, messages })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM ${model} failed: ${res.status} ${errText}`);
  }
  const json = await res.json();
  return {
    model,
    answer: json.choices?.[0]?.message?.content ?? "…",
    usage: json.usage ?? null
  };
}
