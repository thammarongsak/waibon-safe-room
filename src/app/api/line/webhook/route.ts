import { handleWebhook } from "../_handler";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return handleWebhook(req, {
    secret: process.env.LINE_CHANNEL_SECRET!,
    token:  process.env.LINE_CHANNEL_ACCESS_TOKEN!,
    agentName: "Waibon",
  });
}
