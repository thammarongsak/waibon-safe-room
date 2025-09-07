// src/app/api/health/supabase/route.ts
import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    // ping ตารางหลักแบบปลอดภัย (ถ้าไม่มีตาราง จะไม่ล้ม แค่รายงาน error)
    const checks: Record<string, any> = {};

    const aiAgents = await serverSupabase.from("ai_agents").select("id").limit(1);
    checks.ai_agents = {
      ok: !aiAgents.error,
      count: aiAgents.data?.length ?? 0,
      error: aiAgents.error?.message || null,
    };

    const trainingProfiles = await serverSupabase.from("training_profiles").select("id").limit(1);
    checks.training_profiles = {
      ok: !trainingProfiles.error,
      count: trainingProfiles.data?.length ?? 0,
      error: trainingProfiles.error?.message || null,
    };

    return NextResponse.json({
      ok: true,
      env: {
        supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      checks,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
