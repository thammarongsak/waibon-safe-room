import crypto from "crypto";
export function verifySignature(secret: string, body: string, signature: string | null) {
  if (!signature) return false;
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(mac));
}
