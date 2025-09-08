// src/lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client สำหรับฝั่ง Server (API routes, server components)
 * ใช้ Service Role Key เท่านั้น
 */
const serverUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!serverUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

export const supabaseServer = createClient(serverUrl, serviceRoleKey, {
  auth: { persistSession: false }
})
