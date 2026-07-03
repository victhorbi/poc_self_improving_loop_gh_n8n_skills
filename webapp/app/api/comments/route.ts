import { NextResponse } from 'next/server'
import { ghGet, OWNER, REPO } from '@/lib/github'
import type { PRComment } from '@/lib/types'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const prNumber = searchParams.get('pr')
    if (!prNumber) return NextResponse.json({ error: 'pr param required' }, { status: 400 })

    const comments = await ghGet<PRComment[]>(
      `/repos/${OWNER}/${REPO}/issues/${prNumber}/comments?per_page=100`,
    )
    return NextResponse.json(comments)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
