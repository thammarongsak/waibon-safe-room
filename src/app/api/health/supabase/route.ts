// src/app/api/health/supabase/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    // ลองอ่านชื่อตัวเอเจนต์มา 1 ตัว (ตารางของพ่อมีอยู่แล้ว)
    const { data, error } = await supabase
      .from("zeta_agents")
      .select("id,name,core_version")
      .limit(1);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      sample: data?.[0] || null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
