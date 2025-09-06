import { handleWebhook } from "../_handler";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return handleWebhook(req, {
    secret: process.env.LINE2_CHANNEL_SECRET!,
    token:  process.env.LINE2_CHANNEL_ACCESS_TOKEN!,
    agentName: "Waibe",
  });
}
