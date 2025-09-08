// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import { ENV } from './env';

/** ใช้ใน Client (Browser) — ใช้ Anon Key เท่านั้น */
export const supabaseClient = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
