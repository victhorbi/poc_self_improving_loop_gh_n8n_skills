import { NextResponse } from 'next/server'
import { ghGet, OWNER, REPO, WORKFLOW_TYPE_MAP } from '@/lib/github'

interface GHRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
  html_url: string
  head_sha: string
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const branch = searchParams.get('branch')
    const sha = searchParams.get('sha')

    let url = `/repos/${OWNER}/${REPO}/actions/runs?per_page=60`
    if (branch) url += `&branch=${encodeURIComponent(branch)}`

    const data = await ghGet<{ workflow_runs: GHRun[] }>(url)
    let runs = data.workflow_runs

    if (sha) runs = runs.filter(r => r.head_sha === sha)

    const mapped = runs.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      created_at: r.created_at,
      html_url: r.html_url,
      head_sha: r.head_sha,
      workflowType: WORKFLOW_TYPE_MAP[r.name] ?? 'other',
    }))

    return NextResponse.json(mapped)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
