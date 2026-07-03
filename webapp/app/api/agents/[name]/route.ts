import { NextResponse } from 'next/server'
import { ghGet, b64decode, OWNER, REPO } from '@/lib/github'
import type { QualityScore } from '@/lib/types'

function parseQualityScore(raw: string): { prompt: string; qualityScore: QualityScore | null } {
  const m = raw.match(/<!--\s*QUALITY_SCORE\s*([\s\S]*?)-->/)
  if (!m) return { prompt: raw, qualityScore: null }
  try {
    const qualityScore = JSON.parse(m[1].trim()) as QualityScore
    const prompt = raw.replace(/<!--\s*QUALITY_SCORE\s*[\s\S]*?-->\n?/, '').trimStart()
    return { prompt, qualityScore }
  } catch {
    return { prompt: raw, qualityScore: null }
  }
}

interface GHFile { content: string; sha: string }
interface GHContent { name: string; type: string }
interface GHPR {
  number: number
  head: { sha: string; ref: string }
  title: string
}
interface GHPRFile { filename: string }

export async function GET(
  _req: Request,
  { params }: { params: { name: string } },
) {
  try {
    const { name } = params

    // System prompt
    const promptFile = await ghGet<GHFile>(
      `/repos/${OWNER}/${REPO}/contents/agents/${name}/system-prompt.md`,
    )
    const { prompt, qualityScore } = parseQualityScore(b64decode(promptFile.content))

    // Skills directory (optional)
    let skills: string[] = []
    try {
      const dir = await ghGet<GHContent[]>(
        `/repos/${OWNER}/${REPO}/contents/agents/${name}/skills`,
      )
      skills = dir.filter(f => f.type === 'file' && f.name.endsWith('.md')).map(f => f.name)
    } catch {
      // no skills dir
    }

    // Open PRs touching this agent — check the most recent 30
    const allPrs = await ghGet<GHPR[]>(
      `/repos/${OWNER}/${REPO}/pulls?state=open&per_page=30&sort=updated&direction=desc`,
    )

    let activePr: GHPR | null = null
    for (const pr of allPrs) {
      const files = await ghGet<GHPRFile[]>(
        `/repos/${OWNER}/${REPO}/pulls/${pr.number}/files`,
      ).catch(() => [] as GHPRFile[])
      if (files.some(f => f.filename.startsWith(`agents/${name}/`))) {
        activePr = pr
        break
      }
    }

    return NextResponse.json({
      name,
      prompt,
      promptSha: promptFile.sha,
      skills,
      prNumber: activePr?.number ?? null,
      prBranch: activePr?.head.ref ?? null,
      prHeadSha: activePr?.head.sha ?? null,
      qualityScore,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
