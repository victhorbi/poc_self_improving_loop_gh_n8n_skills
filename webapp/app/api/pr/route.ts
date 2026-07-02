import { NextResponse } from 'next/server'
import { ghGet, ghPost, ghPut, b64encode, OWNER, REPO } from '@/lib/github'
import type { CreatePrPayload } from '@/lib/types'

interface GHRef { object: { sha: string } }
interface GHFile { sha: string }
interface GHPR { number: number; html_url: string; head: { sha: string; ref: string } }

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreatePrPayload
    const { agentName, promptContent, skillUpdates, maxIterations, numTests, existingPrBranch } = body

    let branch: string
    let headSha: string

    if (existingPrBranch) {
      // Push to existing PR branch
      branch = existingPrBranch
      const branchRef = await ghGet<GHRef>(`/repos/${OWNER}/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`)
      headSha = branchRef.object.sha
    } else {
      // Create a new branch off main
      const mainRef = await ghGet<GHRef>(`/repos/${OWNER}/${REPO}/git/ref/heads/main`)
      headSha = mainRef.object.sha
      branch = `feat/agent-${agentName}-${Date.now()}`
      await ghPost(`/repos/${OWNER}/${REPO}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: headSha,
      })
    }

    // Update system prompt
    const promptFile = await ghGet<GHFile>(
      `/repos/${OWNER}/${REPO}/contents/agents/${agentName}/system-prompt.md?ref=${encodeURIComponent(existingPrBranch ?? 'main')}`,
    ).catch(() => ({ sha: undefined }))
    await ghPut(`/repos/${OWNER}/${REPO}/contents/agents/${agentName}/system-prompt.md`, {
      message: `feat: update ${agentName} system prompt`,
      content: b64encode(promptContent),
      sha: (promptFile as GHFile).sha,
      branch,
    })

    // Update any modified skills
    for (const [skillName, skillContent] of Object.entries(skillUpdates)) {
      const skillFile = await ghGet<GHFile>(
        `/repos/${OWNER}/${REPO}/contents/agents/${agentName}/skills/${skillName}?ref=${encodeURIComponent(existingPrBranch ?? 'main')}`,
      ).catch(() => ({ sha: undefined }))
      await ghPut(`/repos/${OWNER}/${REPO}/contents/agents/${agentName}/skills/${skillName}`, {
        message: `feat: update ${agentName} skill ${skillName}`,
        content: b64encode(skillContent),
        sha: (skillFile as GHFile).sha,
        branch,
      })
    }

    if (existingPrBranch) {
      // Get the PR number from the branch
      const prs = await ghGet<Array<{ number: number; html_url: string; head: { sha: string; ref: string } }>>(
        `/repos/${OWNER}/${REPO}/pulls?state=open&head=${OWNER}:${encodeURIComponent(branch)}&per_page=1`,
      )
      if (prs.length > 0) {
        const pr = prs[0]
        const updatedRef = await ghGet<GHRef>(`/repos/${OWNER}/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`)
        return NextResponse.json({
          prNumber: pr.number,
          prUrl: pr.html_url,
          prHeadSha: updatedRef.object.sha,
          branch,
        })
      }
    }

    // Create draft PR
    const pr = await ghPost<GHPR>(`/repos/${OWNER}/${REPO}/pulls`, {
      title: `feat: update ${agentName} agent`,
      body: [
        `Updating system prompt for **${agentName}** agent.`,
        '',
        '### Eval KPIs',
        `- Max iterations: **${maxIterations}**`,
        `- Number of tests: **${numTests}**`,
      ].join('\n'),
      head: branch,
      base: 'main',
      draft: true,
    })

    return NextResponse.json({
      prNumber: pr.number,
      prUrl: pr.html_url,
      prHeadSha: pr.head.sha,
      branch,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
