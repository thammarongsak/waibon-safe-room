import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseServer } from '@/lib/supabaseServer'
import { ENV } from '@/lib/env'

export const dynamic = 'force-dynamic'

function verifySignature(body: string, signature: string | null) {
  if (!ENV.LINE_CHANNEL_SECRET) return true // dev mode (ไม่มี secret ก็ข้าม)
  if (!signature) return false
  const h = crypto.createHmac('sha256', ENV.LINE_CHANNEL_SECRET).update(body).digest('base64')
  return h === signature
}

async function replyMessage(replyToken: string, accessToken: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
}

export async function POST(req: Request) {
  const raw = await req.text()
  const signature = req.headers.get('x-line-signature')
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ ok: false, error: 'Bad signature' }, { status: 401 })
  }

  const body = JSON.parse(raw)
  // บอท userId ของเราส่งมาที่ field นี้ → ใช้แม็ปเป็น agent_name
  const botUid: string = body?.destination || ''
  const { data: chan } = await supabaseServer
    .from('line_channels')
    .select('agent_name, access_token, is_enabled')
    .eq('destination', botUid)
    .single()

  // ถ้าไม่พบ mapping ก็จบเงียบ ๆ (กัน error)
  if (!chan || !chan.is_enabled) {
    return NextResponse.json({ ok: true, skipped: 'no-channel' })
  }

  const agentName = chan.agent_name as string
  const accessToken = chan.access_token as string
  const events = body.events || []

  for (const ev of events) {
    if (ev.type !== 'message' || ev.message?.type !== 'text') continue
    const text: string = (ev.message.text || '').trim()
    const replyToken: string = ev.replyToken

    // 1) คำสั่งเปิดห้อง Hive
    if (/^!hive start$/i.test(text)) {
      // seed agent + subscription (เผื่อยังไม่ครบ) และยิง kickoff event
      await supabaseServer.from('hive_agents').upsert([
        { name: 'WaibonOS', capabilities: { speak: true, listen: true, orchestrator: true }, persona: { role: 'leader', style: 'calm' } },
        { name: 'WaibeAI',  capabilities: { speak: true, listen: true, router: true },        persona: { role: 'coordinator', style: 'direct' } },
        { name: 'ZetaAI',   capabilities: { speak: true, listen: true, planner: true },       persona: { role: 'strategist', style: 'analytical' } },
      ])

      await supabaseServer.from('hive_subscriptions').upsert([
        { agent_name: 'WaibonOS', topic: 'msg.chat' },
        { agent_name: 'WaibeAI',  topic: 'msg.chat' },
        { agent_name: 'ZetaAI',   topic: 'msg.chat' },
        { agent_name: 'WaibonOS', topic: 'hive.chat' },
        { agent_name: 'WaibeAI',  topic: 'hive.chat' },
        { agent_name: 'ZetaAI',   topic: 'hive.chat' },
      ])

      await supabaseServer.from('hive_events').insert([
        { topic: 'hive.chat', from_agent: 'WaibonOS', to_agent: 'WaibeAI', payload: { msg: 'เริ่มประชุม Hive' } },
        { topic: 'hive.chat', from_agent: 'WaibeAI',  to_agent: 'ZetaAI',  payload: { msg: 'รับทราบ' } },
        { topic: 'hive.chat', from_agent: 'ZetaAI',   to_agent: 'WaibonOS',payload: { msg: 'พร้อมทำงาน' } },
      ])

      await replyMessage(replyToken, accessToken, 'Hive พร้อมครับ ✅ (WaibonOS • WaibeAI • ZetaAI)')
      continue
    }

    // 2) ข้อความทั่วไป → บันทึก event และตอบกลับแบบสั้น ๆ
    await supabaseServer.from('hive_events').insert({
      topic: 'msg.chat',
      from_agent: 'user',
      to_agent: agentName,
      payload: { text, at: new Date().toISOString() },
    })

    // ตอบแบบตั้งต้น (ให้มีเสียงตอบก่อน)
    const auto =
      agentName === 'WaibonOS'
        ? 'WaibonOS รับทราบครับ'
        : agentName === 'WaibeAI'
        ? 'Waibe พร้อมช่วยโค้ด/SQL ครับ'
        : agentName === 'ZetaAI'
        ? 'Zeta กำลังวางแผนงานให้ครับ'
        : `รับทราบ: ${agentName}`

    await replyMessage(replyToken, accessToken, auto)
  }

  return NextResponse.json({ ok: true })
}
