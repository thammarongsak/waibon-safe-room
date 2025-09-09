import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { orchestrateOne } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- utils
function hmacOk(raw: string, sig: string | null, secret: string | null) {
  if (!secret) return false;
  if (!sig) return false;
  const mac = crypto.createHmac("sha256", secret);
  mac.update(Buffer.from(raw, "utf8"));
  return mac.digest("base64") === sig;
}

async function getLineChannel(destination: string) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await sb
    .from("line_channels")
    .select("destination, secret, access_token, agent_name, is_enabled, father_user_id")
    .eq("destination", destination)
    .maybeSingle();

  if (error || !data) throw new Error("line channel not found: " + (error?.message || destination));
  if (!data.is_enabled) throw new Error("channel disabled");
  return data as {
    destination: string;
    secret: string;
    access_token: string;
    agent_name: string;
    is_enabled: boolean;
    father_user_id: string | null;
  };
}

async function replyLINE(token: string, replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-line-signature") || null;

  // บางเคส LINE ส่ง destination ใน header และใน body
  const hdrDest = req.headers.get("x-line-destination") || "";
  const body = JSON.parse(raw || "{}");
  const destination: string = hdrDest || body?.destination || "";

  try {
    const chan = await getLineChannel(destination);

    // verify ต่อ channel นั้น ๆ
    if (!hmacOk(raw, sig, chan.secret)) {
      return NextResponse.json({ ok: false, error: "bad signature" }, { status: 403 });
    }

    const events = Array.isArray(body?.events) ? body.events : [];
    for (const ev of events) {
      if (ev.type !== "message" || ev.message?.type !== "text") continue;

      const userText: string = String(ev.message.text || "").trim();
      const userId: string = ev?.source?.userId || "unknown";
      const replyToken: string = ev.replyToken;

      if (!userText) {
        await replyLINE(chan.access_token, replyToken, "ครับพ่อ");
        continue;
      }

      // พ่อ = คนเดียวที่สั่งงานได้โดยตรง
      const FATHER_UID = process.env.WAIBON_OWNER_ID || "";
      const isFather = FATHER_UID && userId === FATHER_UID;

      // orchestration แบบ “พูดผ่าน WaibonOS ตัวเดียว” (ตัวอื่นช่วยหลังบ้าน)
      const answer = await orchestrateOne({
        userText,
        isFather,
        lineUserId: userId,
      });

      await replyLINE(chan.access_token, replyToken, answer);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("LINE webhook error:", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
