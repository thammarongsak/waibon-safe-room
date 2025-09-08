// src/lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';
import { ENV } from './env';

/** ใช้ใน Server (API routes / Server Actions) — ใช้ Service Role เท่านั้น */
export const supabaseServer = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
