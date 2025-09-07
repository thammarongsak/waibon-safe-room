// src/lib/line/verify.ts
import crypto from "crypto";
export function verifySignature(secret: string, body: string, sig: string | null) {
  if (!sig) return false;
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mac));
}
