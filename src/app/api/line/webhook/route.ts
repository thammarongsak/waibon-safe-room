import { NextRequest } from "next/server";
import crypto from "crypto";
import { toZetaEvent } from "@/lib/zeta/v10/adapter";
import { zetaHandle } from "@/lib/zeta/v10/core";
import { lineReply, linePush } from "@/lib/zeta/v10/transport";

const SECRET = process.env.LINE_CHANNEL_SECRET!;
const TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

function ok(){ return new Response("OK",{status:200}); }
function bad(){ return new Response("Unauthorized",{status:401}); }

export async function POST(req: NextRequest){
  const sig = req.headers.get("x-line-signature") || "";
  const bodyText = await req.text();
  const h = crypto.createHmac("sha256", SECRET).update(bodyText).digest("base64");
  if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(sig))) return bad();

  (async()=>{
    const body = JSON.parse(bodyText);
    for(const ev of body.events ?? []){
      const z = toZetaEvent(ev);
      if (!z) continue;

      // 1) รับไว้ก่อน (กัน timeout)
      await lineReply(TOKEN, z.replyToken, [{ type:"text", text:"ครับพ่อ กำลังคิดคำตอบให้ครับ…" }]);

      // 2) สมอง v10 คิด → push คำตอบสวยกลับไป
      const replies = await zetaHandle(z);
      await linePush(TOKEN, z.userId, replies);
    }
  })();

  return ok();
}
