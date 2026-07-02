import { NextResponse } from 'next/server'
import { ghGet, b64decode, OWNER, REPO } from '@/lib/github'

interface GHFile { content: string; sha: string }

export async function GET(
  _req: Request,
  { params }: { params: { name: string; skillName: string } },
) {
  try {
    const { name, skillName } = params
    const file = await ghGet<GHFile>(
      `/repos/${OWNER}/${REPO}/contents/agents/${name}/skills/${skillName}`,
    )
    return NextResponse.json({ content: b64decode(file.content), sha: file.sha })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
