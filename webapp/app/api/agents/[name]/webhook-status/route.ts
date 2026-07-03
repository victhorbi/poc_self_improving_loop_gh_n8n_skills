import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { name: string } },
) {
  const { name } = params
  const perAgentKey = `N8N_AGENT_${name.replace(/-/g, '_').toUpperCase()}_WEBHOOK_URL`
  const configured = !!(process.env[perAgentKey] || process.env.N8N_AGENT_WEBHOOK_URL)
  return NextResponse.json({ configured })
}
