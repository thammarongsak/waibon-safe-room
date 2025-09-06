// src/lib/db/supabase.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;

// ใช้ฝั่ง Client (อ่านสาธารณะ) — สำหรับคอมโพเนนต์ฝั่ง client หรือเพจทั่ว ๆ ไป
export const supabase = createClient(
  URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

// ใช้ฝั่ง Server (สิทธิ์สูง) — สำหรับ Route Handlers / Server Actions เท่านั้น
export const serverSupabase = () =>
  createClient(
    URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
