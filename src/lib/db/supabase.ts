// src/lib/db/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// สร้าง client สำหรับฝั่ง server (ไม่เก็บ session)
export const supabase: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// เพื่อให้ไฟล์เก่าๆ ที่ import { serverSupabase } ใช้ต่อได้
export const serverSupabase = supabase;

export type DBClient = typeof supabase;
