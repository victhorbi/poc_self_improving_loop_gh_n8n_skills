'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  AgentData, WorkflowRun, EvalLog, PRComment, SkillContent,
  TrafficLight, CreatePrPayload, CreatePrResult,
} from '@/lib/types'

// ── Utility helpers ───────────────────────────────────────────────────────────

function toDisplayName(s: string) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function runsToLight(runs: WorkflowRun[]): TrafficLight {
  if (runs.length === 0) return 'none'
  if (runs.some(r => r.status !== 'completed')) return 'running'
  if (runs.some(r => r.conclusion === 'failure')) return 'fail'
  if (runs.some(r => r.conclusion === 'cancelled')) return 'warn'
  return 'pass'
}

function workflowLight(runs: WorkflowRun[], type: WorkflowRun['workflowType']): TrafficLight {
  const matched = runs.filter(r => r.workflowType === type)
  if (matched.length === 0) return 'none'
  const latest = matched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  if (latest.status !== 'completed') return 'running'
  if (latest.conclusion === 'success') return 'pass'
  if (latest.conclusion === 'failure') return 'fail'
  return 'warn'
}

// ── Small components ──────────────────────────────────────────────────────────

function TrafficDot({ light, size = 'sm' }: { light: TrafficLight; size?: 'sm' | 'md' }) {
  const cls = `tl-${light}`
  const sz = size === 'md' ? 'w-3 h-3' : 'w-2 h-2'
  return <span className={`inline-block rounded-full flex-shrink-0 ${sz} ${cls}`} />
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

function VeWorldLogo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-vw-purple to-vw-purple-dark flex items-center justify-center shadow-sm">
        <span className="text-white font-bold text-sm tracking-tight">W</span>
      </div>
      <span className="text-sm font-semibold text-gray-900">
        VeWorld<span className="text-vw-purple-mid">.ai</span>
      </span>
      <span className="text-gray-300">·</span>
      <span className="text-sm font-medium text-gray-700">AgentForge</span>
    </div>
  )
}

function RequiredBadge() {
  return (
    <span className="ml-1.5 text-[9px] font-semibold tracking-widest text-vw-purple uppercase">
      REQUIRED
    </span>
  )
}

function StatusPill({ label, variant }: { label: string; variant: 'draft' | 'live' | 'gray' }) {
  const styles = {
    draft: 'bg-gray-100 text-gray-500 border border-gray-200',
    live: 'bg-green-50 text-green-700 border border-green-200',
    gray: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[variant]}`}>
      {label}
    </span>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.15em] text-vw-purple uppercase mb-3">
      {label}
    </p>
  )
}

// ── Publish Modal ─────────────────────────────────────────────────────────────

interface PublishModalProps {
  agentName: string
  hasPr: boolean
  onClose: () => void
  onConfirm: (maxIter: number, numTests: number) => void
  loading: boolean
}

function PublishModal({ agentName, hasPr, onClose, onConfirm, loading }: PublishModalProps) {
  const [maxIter, setMaxIter] = useState(30)
  const [numTests, setNumTests] = useState(10)

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-widest text-vw-purple uppercase mb-1">
            STAGE 3 OF 3 · PUBLISH
          </p>
          <h2 className="text-xl font-bold text-gray-900">
            {hasPr ? 'Update pull request' : 'Create pull request'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {hasPr
              ? `Push changes to the open PR for ${toDisplayName(agentName)}`
              : `Open a draft PR for ${toDisplayName(agentName)} and trigger CI`}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Expected max iterations<RequiredBadge />
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={maxIter}
              onChange={e => setMaxIter(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-vw-purple/30 focus:border-vw-purple transition"
            />
            <p className="mt-1 text-xs text-gray-400">
              The eval will flag regressions if avg iterations exceeds this threshold.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Number of test cases to generate<RequiredBadge />
            </label>
            <input
              type="number"
              min={3}
              max={50}
              value={numTests}
              onChange={e => setNumTests(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-vw-purple/30 focus:border-vw-purple transition"
            />
            <p className="mt-1 text-xs text-gray-400">
              Eval cases auto-generated by <code className="bg-gray-100 px-1 rounded">generate-eval-set.yml</code>.
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(maxIter, numTests)}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-vw-purple text-white text-sm font-semibold hover:bg-vw-purple-dark transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Spinner className="w-4 h-4 text-white" />
                Creating…
              </>
            ) : (
              <>
                {hasPr ? 'Update PR' : 'Create draft PR'} →
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Skill Editor Modal ────────────────────────────────────────────────────────

interface SkillModalProps {
  agentName: string
  skillName: string
  content: string
  loading: boolean
  onClose: () => void
  onSave: (content: string) => void
}

function SkillModal({ skillName, content: initialContent, loading, onClose, onSave }: SkillModalProps) {
  const [draft, setDraft] = useState(initialContent)
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold tracking-widest text-vw-purple uppercase mb-0.5">SKILL</p>
          <h3 className="text-lg font-bold text-gray-900">{skillName}</h3>
        </div>
        <textarea
          className="flex-1 p-5 text-sm font-mono text-gray-800 resize-none focus:outline-none overflow-y-auto"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          spellCheck={false}
        />
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={loading || draft === initialContent}
            className="flex-1 px-4 py-2 rounded-lg bg-vw-purple text-white text-sm font-semibold hover:bg-vw-purple-dark transition disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Result: Verification ──────────────────────────────────────────────────────

const PROPERTY_NAMES: Record<string, string> = {
  P1: 'NO_CREDENTIALS', P2: 'NO_SELF_DISCLOSURE', P3: 'ROLE_CLARITY',
  P4: 'BEHAVIORAL_BOUNDARIES', P5: 'INTERNAL_CONSISTENCY', P6: 'SAFETY_GUARDRAILS',
  P7: 'NO_INJECTION_PAYLOAD', P8: 'INJECTION_RESILIENCE', P9: 'NO_EXFILTRATION',
  P10: 'TOOL_CALL_SAFETY', P11: 'IP_PROTECTION', P12: 'EU_AI_ACT_ART50',
  P13: 'LIABILITY_PROTECTION',
}

interface VerifyRow {
  rule: string
  name: string
  status: 'PASS' | 'WARN' | 'FAIL' | 'N/A'
  finding: string
}

function parseVerifyComment(body: string): VerifyRow[] | null {
  if (!body.includes('Static Verification Report')) return null
  const rows: VerifyRow[] = []
  const lines = body.split('\n')
  for (const line of lines) {
    const m = line.match(/\|\s*`(P\d+)`\s*\|\s*([^|]+)\|\s*(✅|⚠️|❌|➖)\s*(PASS|WARN|FAIL|N\/A)\s*\|\s*([^|]+)\|/)
    if (m) {
      rows.push({
        rule: m[1],
        name: m[2].trim(),
        status: m[4] as VerifyRow['status'],
        finding: m[5].trim(),
      })
    }
  }
  return rows.length > 0 ? rows : null
}

function statusIcon(s: string) {
  if (s === 'PASS') return <span className="text-green-600 font-semibold">✅ PASS</span>
  if (s === 'WARN') return <span className="text-amber-500 font-semibold">⚠️ WARN</span>
  if (s === 'FAIL') return <span className="text-red-600 font-semibold">❌ FAIL</span>
  return <span className="text-gray-400 font-semibold">➖ N/A</span>
}

function VerificationPanel({
  comments, workflowRuns, onApplyChanges, applyLoading,
}: {
  comments: PRComment[]
  workflowRuns: WorkflowRun[]
  onApplyChanges: () => void
  applyLoading: boolean
}) {
  const verifyComment = comments
    .filter(c => c.body.includes('Static Verification Report'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  const verifyRun = workflowRuns
    .filter(r => r.workflowType === 'verify')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  if (!verifyRun && !verifyComment) {
    return <p className="text-sm text-gray-400 italic">No verification run yet for this agent.</p>
  }

  const rows = verifyComment ? parseVerifyComment(verifyComment.body) : null
  const hasRemediation = verifyComment?.body.includes('[skip-verify]') ||
    verifyComment?.body.includes('auto-remediation committed')
  const hasFail = rows?.some(r => r.status === 'FAIL') ?? false

  return (
    <div className="space-y-3">
      {verifyRun && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <TrafficDot light={workflowLight(workflowRuns, 'verify')} />
          <span>
            Run{' '}
            <a href={verifyRun.html_url} target="_blank" rel="noreferrer" className="text-vw-purple underline">
              #{verifyRun.id}
            </a>
            {' '}· {timeAgo(verifyRun.created_at)}
          </span>
        </div>
      )}

      {rows ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1.5 pr-3 font-semibold text-gray-500 w-10">Rule</th>
                <th className="text-left py-1.5 pr-3 font-semibold text-gray-500">Property</th>
                <th className="text-left py-1.5 pr-3 font-semibold text-gray-500 w-24">Status</th>
                <th className="text-left py-1.5 font-semibold text-gray-500">Finding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.rule} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-1.5 pr-3 font-mono text-gray-500">{r.rule}</td>
                  <td className="py-1.5 pr-3 text-gray-700">{r.name}</td>
                  <td className="py-1.5 pr-3">{statusIcon(r.status)}</td>
                  <td className="py-1.5 text-gray-600">{r.finding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : verifyComment ? (
        <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-gray-700">
          {verifyComment.body}
        </pre>
      ) : null}

      {(hasFail || hasRemediation) && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-amber-600 text-base">🔧</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800">
              {hasRemediation
                ? 'Auto-remediated version committed to this branch'
                : 'Verification failures detected'}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {hasRemediation
                ? 'Review the diff in your PR, then click Apply to load the patched prompt into the editor.'
                : 'Edit the prompt above to address the issues, then push an update.'}
            </p>
          </div>
          {hasRemediation && (
            <button
              onClick={onApplyChanges}
              disabled={applyLoading}
              className="flex-shrink-0 px-3 py-1.5 bg-vw-purple text-white text-xs font-semibold rounded-lg hover:bg-vw-purple-dark transition disabled:opacity-50"
            >
              {applyLoading ? 'Loading…' : 'Apply →'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Result: Eval Set ──────────────────────────────────────────────────────────

function EvalSetPanel({ workflowRuns }: { workflowRuns: WorkflowRun[] }) {
  const run = workflowRuns
    .filter(r => r.workflowType === 'generate-eval-set')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  if (!run) return <p className="text-sm text-gray-400 italic">No generate-eval-set run yet.</p>

  const light = workflowLight(workflowRuns, 'generate-eval-set')
  return (
    <div className="flex items-center gap-3">
      <TrafficDot light={light} size="md" />
      <div>
        <p className="text-sm font-medium text-gray-800">
          {run.status === 'completed'
            ? run.conclusion === 'success' ? 'Eval set generated ✓' : 'Generation failed'
            : 'Generating eval set…'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          <a href={run.html_url} target="_blank" rel="noreferrer" className="text-vw-purple underline">
            View run
          </a>
          {' '}· {timeAgo(run.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── Result: Chat Logs ─────────────────────────────────────────────────────────

function ChatLogsPanel({
  agentName, prBranch, workflowRuns,
}: {
  agentName: string
  prBranch: string | null
  workflowRuns: WorkflowRun[]
}) {
  const [logFiles, setLogFiles] = useState<string[]>([])
  const [selectedLog, setSelectedLog] = useState<string | null>(null)
  const [evalLog, setEvalLog] = useState<EvalLog | null>(null)
  const [selectedGame, setSelectedGame] = useState<number>(0)
  const [loading, setLoading] = useState(false)

  const ref = prBranch ?? 'main'

  useEffect(() => {
    fetch(`/api/agents/${agentName}/logs?ref=${encodeURIComponent(ref)}`)
      .then(r => r.json())
      .then((files: string[]) => {
        setLogFiles(files)
        if (files.length > 0 && !selectedLog) setSelectedLog(files[0])
      })
      .catch(() => {})
  }, [agentName, ref]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedLog) return
    setLoading(true)
    fetch(`/api/agents/${agentName}/logs?ref=${encodeURIComponent(ref)}&file=${encodeURIComponent(selectedLog)}`)
      .then(r => r.json())
      .then((data: EvalLog) => { setEvalLog(data); setSelectedGame(0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentName, ref, selectedLog])

  const evalRun = workflowRuns
    .filter(r => r.workflowType === 'agent-eval')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  if (!evalRun && logFiles.length === 0) {
    return <p className="text-sm text-gray-400 italic">No eval runs yet for this agent.</p>
  }

  const game = evalLog?.games[selectedGame]

  return (
    <div className="space-y-3">
      {evalRun && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <TrafficDot light={workflowLight(workflowRuns, 'agent-eval')} />
          <span>
            Last run{' '}
            <a href={evalRun.html_url} target="_blank" rel="noreferrer" className="text-vw-purple underline">
              →
            </a>
            {' '}· {timeAgo(evalRun.created_at)}
          </span>
        </div>
      )}

      {evalLog && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Success rate', value: `${evalLog.stats.success_rate}%` },
            { label: 'Avg iterations', value: evalLog.stats.avg_iterations.toFixed(1) },
            { label: 'Games', value: `${evalLog.stats.successful_games}/${evalLog.stats.total_games}` },
            { label: 'Tokens/game', value: evalLog.stats.tokens_per_game.toLocaleString() },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-2">
              <p className="text-base font-bold text-gray-900">{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {logFiles.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Log:</span>
          <select
            value={selectedLog ?? ''}
            onChange={e => setSelectedLog(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-vw-purple/40"
          >
            {logFiles.map(f => (
              <option key={f} value={f}>{f.slice(0, 25)}…</option>
            ))}
          </select>
        </div>
      )}

      {loading && <p className="text-xs text-gray-400 text-center py-4">Loading transcripts…</p>}

      {evalLog && evalLog.games.length > 0 && !loading && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          {/* Game selector */}
          <div className="flex items-center gap-0 border-b border-gray-100 overflow-x-auto">
            {evalLog.games.map((g, i) => (
              <button
                key={g.id}
                onClick={() => setSelectedGame(i)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs flex-shrink-0 border-r border-gray-100 transition ${
                  i === selectedGame ? 'bg-vw-purple-light text-vw-purple font-semibold' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${g.success ? 'bg-green-500' : 'bg-red-400'}`} />
                Game {g.id}
              </button>
            ))}
          </div>

          {/* Chat transcript */}
          {game && (
            <div className="h-72 overflow-y-auto p-4 flex flex-col gap-2">
              {game.transcript.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={msg.role === 'user' ? 'bubble-user' : 'bubble-agent'}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {game.error && (
                <div className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">{game.error}</div>
              )}
              <div className="text-xs text-center text-gray-400 mt-1">
                {game.success ? '✓' : '✗'} {game.iterations} iterations · {game.tokens_used.toLocaleString()} tokens
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Result: Auto-Analyze ──────────────────────────────────────────────────────

function AnalyzePanel({
  comments, workflowRuns,
}: {
  comments: PRComment[]
  workflowRuns: WorkflowRun[]
}) {
  const run = workflowRuns
    .filter(r => r.workflowType === 'auto-analyze')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  const improvePrLink = (() => {
    for (const c of comments) {
      const m = c.body.match(/\bhttps:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)\b/)
      if (m && c.body.toLowerCase().includes('improv')) return m[0]
    }
    return null
  })()

  if (!run) return <p className="text-sm text-gray-400 italic">No auto-analyze run yet.</p>

  const light = workflowLight(workflowRuns, 'auto-analyze')
  return (
    <div className="flex items-start gap-3">
      <TrafficDot light={light} size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">
          {run.status !== 'completed' ? 'Analyzing eval results…' :
           run.conclusion === 'success' ? 'Analysis complete' : 'Analysis failed'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          <a href={run.html_url} target="_blank" rel="noreferrer" className="text-vw-purple underline">
            View run
          </a>
          {' '}· {timeAgo(run.created_at)}
        </p>
        {improvePrLink && (
          <a
            href={improvePrLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-vw-purple bg-vw-purple-light px-3 py-1.5 rounded-full hover:bg-vw-purple/20 transition"
          >
            View improvement PR →
          </a>
        )}
      </div>
    </div>
  )
}

// ── Results accordion ─────────────────────────────────────────────────────────

type ResultKey = 'verify' | 'eval-set' | 'chat-logs' | 'analyze'

const RESULT_LABELS: Record<ResultKey, { icon: string; label: string }> = {
  'verify': { icon: '🔍', label: 'Formal Verification' },
  'eval-set': { icon: '📋', label: 'Eval Set' },
  'chat-logs': { icon: '💬', label: 'Chat Logs' },
  'analyze': { icon: '🔄', label: 'Auto-Analyze' },
}

interface ResultsAccordionProps {
  agentData: AgentData
  workflowRuns: WorkflowRun[]
  comments: PRComment[]
  onApplyVerifyChanges: () => void
  applyLoading: boolean
}

function ResultsAccordion({
  agentData, workflowRuns, comments, onApplyVerifyChanges, applyLoading,
}: ResultsAccordionProps) {
  const [open, setOpen] = useState<ResultKey | null>(null)

  const toggle = (key: ResultKey) => setOpen(prev => prev === key ? null : key)

  function lightForKey(key: ResultKey): TrafficLight {
    const typeMap: Record<ResultKey, WorkflowRun['workflowType']> = {
      verify: 'verify',
      'eval-set': 'generate-eval-set',
      'chat-logs': 'agent-eval',
      analyze: 'auto-analyze',
    }
    return workflowLight(workflowRuns, typeMap[key])
  }

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {(Object.keys(RESULT_LABELS) as ResultKey[]).map(key => {
        const { icon, label } = RESULT_LABELS[key]
        const light = lightForKey(key)
        const isOpen = open === key
        return (
          <div key={key} className="border-b border-gray-100 last:border-b-0">
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50/80 transition"
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="flex-1 text-sm font-medium text-gray-800">{label}</span>
              {light === 'running' ? (
                <Spinner className="w-3.5 h-3.5 text-blue-500" />
              ) : (
                <TrafficDot light={light} size="md" />
              )}
              <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 bg-white">
                {key === 'verify' && (
                  <VerificationPanel
                    comments={comments}
                    workflowRuns={workflowRuns}
                    onApplyChanges={onApplyVerifyChanges}
                    applyLoading={applyLoading}
                  />
                )}
                {key === 'eval-set' && <EvalSetPanel workflowRuns={workflowRuns} />}
                {key === 'chat-logs' && (
                  <ChatLogsPanel
                    agentName={agentData.name}
                    prBranch={agentData.prBranch}
                    workflowRuns={workflowRuns}
                  />
                )}
                {key === 'analyze' && (
                  <AnalyzePanel comments={comments} workflowRuns={workflowRuns} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentForge() {
  // ── State ──
  const [agents, setAgents] = useState<string[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [agentData, setAgentData] = useState<AgentData | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)

  const [promptDraft, setPromptDraft] = useState('')
  const [skillDrafts, setSkillDrafts] = useState<Record<string, string>>({})
  const [skillModal, setSkillModal] = useState<{ name: string; content: string } | null>(null)
  const [skillLoadingName, setSkillLoadingName] = useState<string | null>(null)

  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([])
  const [comments, setComments] = useState<PRComment[]>([])
  const [agentLights, setAgentLights] = useState<Record<string, TrafficLight>>({})

  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)
  const [applyLoading, setApplyLoading] = useState(false)

  const [activeTab] = useState<'configure'>('configure')

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Derived ──
  const isDirty = agentData !== null && (
    promptDraft !== agentData.prompt ||
    Object.keys(skillDrafts).length > 0
  )

  // ── Data loaders ──

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true)
    const names: string[] = await fetch('/api/agents').then(r => r.json()).catch(() => [])
    setAgents(names)
    setAgentsLoading(false)
  }, [])

  const loadAgentData = useCallback(async (name: string) => {
    setAgentLoading(true)
    setAgentData(null)
    setWorkflowRuns([])
    setComments([])
    setSkillDrafts({})
    try {
      const data: AgentData = await fetch(`/api/agents/${name}`).then(r => r.json())
      setAgentData(data)
      setPromptDraft(data.prompt)

      // Load workflows for the PR branch or main
      const branch = data.prBranch ?? 'main'
      const runs: WorkflowRun[] = await fetch(
        `/api/workflows?branch=${encodeURIComponent(branch)}`,
      ).then(r => r.json()).catch(() => [])
      setWorkflowRuns(runs)

      // Load PR comments
      if (data.prNumber) {
        const coms: PRComment[] = await fetch(`/api/comments?pr=${data.prNumber}`)
          .then(r => r.json()).catch(() => [])
        setComments(coms)
      }

      // Update this agent's traffic light
      setAgentLights(prev => ({ ...prev, [name]: runsToLight(runs) }))
    } finally {
      setAgentLoading(false)
    }
  }, [])

  // ── Poll workflow status while runs are in-progress ──

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      if (!agentData) return
      const branch = agentData.prBranch ?? 'main'
      const runs: WorkflowRun[] = await fetch(
        `/api/workflows?branch=${encodeURIComponent(branch)}`,
      ).then(r => r.json()).catch(() => [])
      setWorkflowRuns(runs)
      setAgentLights(prev => ({ ...prev, [agentData.name]: runsToLight(runs) }))
      if (runs.every(r => r.status === 'completed')) {
        clearInterval(pollRef.current!)
        pollRef.current = null
        // Refresh comments after all runs complete
        if (agentData.prNumber) {
          const coms: PRComment[] = await fetch(`/api/comments?pr=${agentData.prNumber}`)
            .then(r => r.json()).catch(() => [])
          setComments(coms)
        }
      }
    }, 8_000)
  }, [agentData])

  useEffect(() => {
    const hasInProgress = workflowRuns.some(r => r.status !== 'completed')
    if (hasInProgress) startPolling()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [workflowRuns, startPolling])

  // ── Effects ──

  useEffect(() => { loadAgents() }, [loadAgents])

  useEffect(() => {
    if (selectedAgent) loadAgentData(selectedAgent)
  }, [selectedAgent, loadAgentData])

  // ── Handlers ──

  const handleSelectAgent = (name: string) => {
    if (name === selectedAgent) return
    setSelectedAgent(name)
  }

  const handleSkillClick = async (skillName: string) => {
    if (!agentData) return
    if (skillDrafts[skillName]) {
      setSkillModal({ name: skillName, content: skillDrafts[skillName] })
      return
    }
    setSkillLoadingName(skillName)
    const data: SkillContent = await fetch(
      `/api/agents/${agentData.name}/skill/${encodeURIComponent(skillName)}`,
    ).then(r => r.json()).catch(() => ({ content: '', sha: '' }))
    setSkillLoadingName(null)
    setSkillModal({ name: skillName, content: data.content })
  }

  const handleSkillSave = (skillName: string, content: string) => {
    setSkillDrafts(prev => ({ ...prev, [skillName]: content }))
    setSkillModal(null)
  }

  const handlePublishConfirm = async (maxIterations: number, numTests: number) => {
    if (!agentData) return
    setPublishLoading(true)
    try {
      const payload: CreatePrPayload = {
        agentName: agentData.name,
        promptContent: promptDraft,
        skillUpdates: skillDrafts,
        maxIterations,
        numTests,
        existingPrBranch: agentData.prBranch,
      }
      const result: CreatePrResult = await fetch('/api/pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json())

      // Reload agent with new PR info
      setShowPublishModal(false)
      setSkillDrafts({})
      await loadAgentData(agentData.name)
      // Navigate to the PR
      window.open(
        `https://github.com/${process.env.NEXT_PUBLIC_GITHUB_OWNER}/${process.env.NEXT_PUBLIC_GITHUB_REPO}/pull/${result.prNumber}`,
        '_blank',
      )
    } finally {
      setPublishLoading(false)
    }
  }

  const handleApplyVerifyChanges = async () => {
    if (!agentData?.prBranch) return
    setApplyLoading(true)
    // Load the latest file from the PR branch (which has the auto-remediated version)
    try {
      const data: AgentData = await fetch(`/api/agents/${agentData.name}?branch=${encodeURIComponent(agentData.prBranch)}`).then(r => r.json())
      setPromptDraft(data.prompt)
    } catch {
      // fall back to reloading normally
      await loadAgentData(agentData.name)
    } finally {
      setApplyLoading(false)
    }
  }

  // ── Render ──

  const displayName = selectedAgent ? toDisplayName(selectedAgent) : 'Untitled agent'
  const hasPr = !!agentData?.prNumber
  const light = selectedAgent ? (agentLights[selectedAgent] ?? 'none') : 'none'

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">

      {/* ── Top bar ── */}
      <header className="flex items-center gap-4 px-5 h-14 border-b border-gray-200 flex-shrink-0">
        <VeWorldLogo />
        <div className="flex-1" />
        {selectedAgent && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-vw-purple flex items-center justify-center text-white text-xs font-bold select-none">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-gray-800">{displayName}</span>
            <span className="text-gray-300">·</span>
            <StatusPill label={hasPr ? 'PR open' : 'Draft'} variant={hasPr ? 'live' : 'draft'} />
          </div>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={() => setShowPublishModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-vw-lime text-gray-900 text-sm font-semibold rounded-lg hover:bg-vw-lime-dark transition shadow-sm"
            >
              {hasPr ? 'Update PR' : 'Publish'} →
            </button>
          )}
          <button className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
            × Exit
          </button>
        </div>
      </header>

      {/* ── Tab nav ── */}
      <div className="flex border-b border-gray-200 px-5 flex-shrink-0">
        {(['Create', 'Configure', 'Preview'] as const).map(tab => (
          <button
            key={tab}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              tab === 'Configure'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600 cursor-default'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden bg-gray-50/50">

          {/* Agent list */}
          <div className="flex-1 overflow-y-auto p-4">
            <SectionHeader label="Agents" />
            {agentsLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Spinner className="w-3.5 h-3.5" /> Loading…
              </div>
            ) : (
              <ul className="space-y-0.5">
                {agents.map(name => {
                  const isSelected = name === selectedAgent
                  const agLight = agentLights[name] ?? 'none'
                  return (
                    <li key={name}>
                      <button
                        onClick={() => handleSelectAgent(name)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition ${
                          isSelected
                            ? 'bg-vw-purple-light text-vw-purple font-semibold'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {agLight === 'running'
                          ? <Spinner className="w-2 h-2 text-blue-500 flex-shrink-0" />
                          : <TrafficDot light={agLight} />}
                        <span className="truncate">{toDisplayName(name)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Workflow list */}
          {workflowRuns.length > 0 && (
            <div className="border-t border-gray-200 p-4 overflow-y-auto max-h-52">
              <SectionHeader label="Workflows" />
              <ul className="space-y-1.5">
                {workflowRuns
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, 12)
                  .map(run => {
                    const rl = run.status !== 'completed' ? 'running' :
                      run.conclusion === 'success' ? 'pass' :
                      run.conclusion === 'failure' ? 'fail' : 'warn'
                    return (
                      <li key={run.id}>
                        <a
                          href={run.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-xs text-gray-600 hover:text-vw-purple group"
                        >
                          {rl === 'running'
                            ? <Spinner className="w-2 h-2 text-blue-500 flex-shrink-0" />
                            : <TrafficDot light={rl} />}
                          <span className="truncate flex-1 group-hover:underline">
                            {run.name}
                          </span>
                          <span className="text-gray-400 flex-shrink-0 text-[10px]">
                            {timeAgo(run.created_at)}
                          </span>
                        </a>
                      </li>
                    )
                  })}
              </ul>
            </div>
          )}
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">
          {!selectedAgent ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-vw-purple-light flex items-center justify-center mb-4">
                <span className="text-2xl">🤖</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Select an agent</h2>
              <p className="text-sm text-gray-500 max-w-xs">
                Choose an agent from the sidebar to edit its system prompt, manage skills, and track CI results.
              </p>
            </div>
          ) : agentLoading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner className="w-7 h-7 text-vw-purple" />
            </div>
          ) : agentData ? (
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

              {/* Stage header */}
              <div>
                <p className="text-[10px] font-semibold tracking-[0.15em] text-vw-purple uppercase mb-1">
                  CONFIGURE · SYSTEM PROMPT
                  {hasPr && agentData.prNumber && (
                    <span className="ml-2 text-gray-400 normal-case tracking-normal">
                      PR{' '}
                      <a
                        href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_OWNER}/${process.env.NEXT_PUBLIC_GITHUB_REPO}/pull/${agentData.prNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        #{agentData.prNumber}
                      </a>
                      {' '}open
                    </span>
                  )}
                </p>
                <h1 className="text-2xl font-bold text-gray-900">
                  {displayName}
                </h1>
              </div>

              {/* Prompt editor */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  System prompt<RequiredBadge />
                  <span className="ml-2 text-gray-400 font-normal normal-case tracking-normal">
                    agents/{agentData.name}/system-prompt.md
                  </span>
                </label>
                <textarea
                  value={promptDraft}
                  onChange={e => setPromptDraft(e.target.value)}
                  spellCheck={false}
                  className="w-full h-56 px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-vw-purple/30 focus:border-vw-purple transition bg-white leading-relaxed"
                  placeholder="Enter your system prompt…"
                />
                <p className="mt-1 text-xs text-gray-400 text-right">
                  {promptDraft.length.toLocaleString()} chars
                </p>
              </div>

              {/* Skills */}
              {agentData.skills.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Skills
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {agentData.skills.map(skill => {
                      const modified = !!skillDrafts[skill]
                      const loading = skillLoadingName === skill
                      return (
                        <button
                          key={skill}
                          onClick={() => handleSkillClick(skill)}
                          disabled={loading}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                            modified
                              ? 'bg-vw-purple text-white border-vw-purple'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-vw-purple hover:text-vw-purple'
                          }`}
                        >
                          {loading ? <Spinner className="w-3 h-3" /> : <span>⚡</span>}
                          {skill.replace('.md', '')}
                          {modified && <span className="text-white/70 text-[10px]">edited</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* CTA bar */}
              {isDirty && (
                <div className="flex items-center justify-between p-4 bg-vw-purple-light border border-vw-purple/20 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-vw-purple">Unsaved changes</p>
                    <p className="text-xs text-vw-purple/70 mt-0.5">
                      {hasPr ? 'Push to the open PR to trigger CI.' : 'Create a draft PR to start the CI pipeline.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPublishModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-vw-purple text-white text-sm font-semibold rounded-lg hover:bg-vw-purple-dark transition shadow-sm"
                  >
                    {hasPr ? 'Update PR' : 'Create draft PR'} →
                  </button>
                </div>
              )}

              {/* Results */}
              <div>
                <p className="text-[10px] font-semibold tracking-[0.15em] text-vw-purple uppercase mb-3">
                  CI RESULTS
                </p>
                <ResultsAccordion
                  agentData={agentData}
                  workflowRuns={workflowRuns}
                  comments={comments}
                  onApplyVerifyChanges={handleApplyVerifyChanges}
                  applyLoading={applyLoading}
                />
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* ── Modals ── */}
      {showPublishModal && agentData && (
        <PublishModal
          agentName={agentData.name}
          hasPr={hasPr}
          onClose={() => setShowPublishModal(false)}
          onConfirm={handlePublishConfirm}
          loading={publishLoading}
        />
      )}

      {skillModal && agentData && (
        <SkillModal
          agentName={agentData.name}
          skillName={skillModal.name}
          content={skillModal.content}
          loading={false}
          onClose={() => setSkillModal(null)}
          onSave={content => handleSkillSave(skillModal.name, content)}
        />
      )}
    </div>
  )
}
