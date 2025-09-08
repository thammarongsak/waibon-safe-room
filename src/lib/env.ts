// src/lib/env.ts
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const ENV = {
  // Supabase
  SUPABASE_URL: need('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: need('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: need('SUPABASE_SERVICE_ROLE_KEY'),

  // LLM keys
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  LLAMA_API_KEY: process.env.LLAMA_API_KEY || process.env.LLAMA3_API_KEY || '',

  // LINE (optional for dev)
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || '',
};
