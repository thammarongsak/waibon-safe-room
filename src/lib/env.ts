// src/lib/env.ts
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const ENV = {
  SUPABASE_URL: need('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: need('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: need('SUPABASE_SERVICE_ROLE_KEY'),

  // LINE (มีหรือไม่มีก็ได้—ถ้าไม่ใช้ webhook ให้คงไว้เฉยๆ)
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || '',
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
};
