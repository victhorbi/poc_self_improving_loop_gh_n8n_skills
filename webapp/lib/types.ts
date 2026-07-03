export type WorkflowType = 'verify' | 'generate-eval-set' | 'agent-eval' | 'auto-analyze' | 'other'
export type RunStatus = 'queued' | 'in_progress' | 'completed'
export type RunConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | null
export type TrafficLight = 'pass' | 'warn' | 'fail' | 'running' | 'none'

export interface WorkflowRun {
  id: number
  name: string
  status: RunStatus
  conclusion: RunConclusion
  created_at: string
  html_url: string
  head_sha: string
  workflowType: WorkflowType
}

export interface QualityScore {
  model?: string
  total_games?: number
  valid_games?: number
  errored_games?: number
  successful_games?: number
  success_rate?: number
  avg_iterations?: number
  [key: string]: unknown
}

export interface AgentData {
  name: string
  prompt: string
  promptSha: string
  skills: string[]
  prNumber: number | null
  prBranch: string | null
  prHeadSha: string | null
  qualityScore: QualityScore | null
}

export interface SkillContent {
  content: string
  sha: string
}

export interface GameMessage {
  role: 'agent' | 'user'
  text: string
}

export interface GameResult {
  id: number
  success: boolean
  iterations: number
  tokens_used: number
  transcript: GameMessage[]
  error?: string
}

export interface EvalLog {
  run_id: string
  branch: string | null
  pr_number: number | null
  agent_folder: string
  evaluated_at: string
  stats: {
    success_rate: number
    avg_iterations: number
    total_games: number
    successful_games: number
    valid_games: number
    errored_games: number
    total_tokens: number
    tokens_per_game: number
  }
  games: GameResult[]
}

export interface PRComment {
  id: number
  body: string
  created_at: string
  user: { login: string }
}

export interface CreatePrPayload {
  agentName: string
  promptContent: string
  skillUpdates: Record<string, string>
  maxIterations: number
  numTests: number
  existingPrBranch: string | null
}

export interface CreatePrResult {
  prNumber: number
  prUrl: string
  prHeadSha: string
  branch: string
}
