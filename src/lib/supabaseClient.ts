// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import { ENV } from './env';

export const supabaseClient = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
