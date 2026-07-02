import { NextResponse } from 'next/server'
import { ghGet, b64decode, OWNER, REPO } from '@/lib/github'

interface GHContent { name: string; type: string; path: string }
interface GHFile { content: string; sha: string }

export async function GET(
  req: Request,
  { params }: { params: { name: string } },
) {
  try {
    const { name } = params
    const { searchParams } = new URL(req.url)
    const ref = searchParams.get('ref') ?? 'main'
    const logFile = searchParams.get('file')

    if (logFile) {
      // Return the content of a specific log file
      const file = await ghGet<GHFile>(
        `/repos/${OWNER}/${REPO}/contents/agents/${name}/evals/logs/${logFile}?ref=${encodeURIComponent(ref)}`,
      )
      const parsed = JSON.parse(b64decode(file.content))
      return NextResponse.json(parsed)
    }

    // List all log files
    const dir = await ghGet<GHContent[]>(
      `/repos/${OWNER}/${REPO}/contents/agents/${name}/evals/logs?ref=${encodeURIComponent(ref)}`,
    ).catch(() => [] as GHContent[])

    const logs = dir
      .filter(f => f.type === 'file' && f.name.endsWith('.json'))
      .map(f => f.name)
      .sort()
      .reverse()

    return NextResponse.json(logs)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
