// /src/app/api/health/supabase/route.ts
import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const s = serverSupabase();
    const { data, error } = await s
      .from("zeta_agents")
      .select("id,name,core_version")
      .limit(1);

    if (error) throw error;
    return NextResponse.json({ ok: true, sample: data?.[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

