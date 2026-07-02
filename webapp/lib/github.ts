const BASE = 'https://api.github.com'

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

export async function ghGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`GitHub GET ${path} → ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export async function ghPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`GitHub POST ${path} → ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export async function ghPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`GitHub PUT ${path} → ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export function b64decode(s: string): string {
  return Buffer.from(s.replace(/\n/g, ''), 'base64').toString('utf-8')
}

export function b64encode(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
}

export const OWNER = process.env.GITHUB_OWNER ?? ''
export const REPO = process.env.GITHUB_REPO ?? ''

export const WORKFLOW_TYPE_MAP: Record<string, string> = {
  'Verify Prompt & Skills': 'verify',
  'Generate Eval Set': 'generate-eval-set',
  'Agent Eval': 'agent-eval',
  'Auto Analyze': 'auto-analyze',
}
