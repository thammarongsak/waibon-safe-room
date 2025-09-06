// src/lib/zeta/v10/memory.ts
type Mem = { userId: string; text: string; t: number };
const STM: Record<string, Mem[]> = {};

export async function addMemory(userId: string, text: string) {
  const arr = STM[userId] ?? (STM[userId] = []);
  arr.push({ userId, text, t: Date.now() });
  if (arr.length > 20) arr.shift(); // เก็บสั้น ๆ
}

export async function getContext(userId: string): Promise<string> {
  const arr = STM[userId] ?? [];
  return arr.slice(-6).map(m => m.text).join("\n");
}

