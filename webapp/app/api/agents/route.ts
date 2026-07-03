import { NextResponse } from 'next/server'
import { ghGet, OWNER, REPO } from '@/lib/github'

interface GHContent { name: string; type: string }

export async function GET() {
  try {
    const items = await ghGet<GHContent[]>(`/repos/${OWNER}/${REPO}/contents/agents`)
    const names = items.filter(i => i.type === 'dir').map(i => i.name).sort()
    return NextResponse.json(names)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
