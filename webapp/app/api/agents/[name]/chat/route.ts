import { NextResponse } from 'next/server'

const OWNER = process.env.GITHUB_OWNER ?? ''
const REPO = process.env.GITHUB_REPO ?? ''

function extractOutput(data: unknown): string | null {
  if (typeof data === 'string') return data
  if (Array.isArray(data) && data.length) return extractOutput(data[0])
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const key of ['output', 'text', 'response', 'answer', 'message']) {
      const v = o[key]
      if (typeof v === 'string') return v
    }
    if (o.data) return extractOutput(o.data)
    if (o.json) return extractOutput(o.json)
  }
  return null
}

export async function POST(
  req: Request,
  { params }: { params: { name: string } },
) {
  try {
    const { message, sessionId } = await req.json() as { message: string; sessionId: string }
    const { name } = params

    const perAgentKey = `N8N_AGENT_${name.replace(/-/g, '_').toUpperCase()}_WEBHOOK_URL`
    const webhookUrl = process.env[perAgentKey] ?? process.env.N8N_AGENT_WEBHOOK_URL

    if (!webhookUrl) {
      return NextResponse.json(
        { error: `No webhook URL configured. Set ${perAgentKey} or N8N_AGENT_WEBHOOK_URL in .env.local` },
        { status: 503 },
      )
    }

    const payload: Record<string, unknown> = {
      action: 'sendMessage',
      chatInput: message,
      sessionId,
      owner: OWNER,
      repo: REPO,
      agentFolder: `agents/${name}`,
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const raw = await res.text()
    if (!res.ok) {
      return NextResponse.json({ error: `Agent error ${res.status}: ${raw.slice(0, 200)}` }, { status: 502 })
    }

    let data: unknown
    try { data = JSON.parse(raw) } catch { return NextResponse.json({ reply: raw.trim() }) }

    const reply = extractOutput(data) ?? raw.trim()
    return NextResponse.json({ reply })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
