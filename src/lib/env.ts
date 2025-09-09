// src/lib/env.ts
export type Env = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_BASE_URL: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  WAIBON_OWNER_ID: string;
  HEYGEN_API_KEY: string;

  // backward-compat (บางไฟล์เก่าอาจอ้างถึง)
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
};

export const ENV: Env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  WAIBON_OWNER_ID: process.env.WAIBON_OWNER_ID || "",
  HEYGEN_API_KEY: process.env.HEYGEN_API_KEY || "",

  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || "",
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
};

// ให้ไฟล์เก่า import ได้หลายแบบ
export default ENV;
export const env = ENV;
export function getEnv() { return ENV; }
