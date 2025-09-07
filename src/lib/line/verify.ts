import crypto from "crypto";

/** Verify LINE signature using channel secret */
export function verifySignature(secret: string, body: string, signatureHeader: string | null) {
  if (!signatureHeader) return false;
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(mac);
  if (a.length !== b.length) return false; // ป้องกัน timingSafeEqual โยน error
  return crypto.timingSafeEqual(a, b);
}
