'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  AgentData, WorkflowRun, EvalLog, PRComment, SkillContent,
  TrafficLight, CreatePrPayload, CreatePrResult,
} from '@/lib/types'

// ── Utility helpers ───────────────────────────────────────────────────────────

type DiffLine = { type: 'unchanged' | 'added' | 'removed'; text: string }

function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const result: DiffLine[] = []
  let ai = 0, bi = 0
  while (ai < aLines.length || bi < bLines.length) {
    if (ai >= aLines.length) { result.push({ type: 'added', text: bLines[bi++] }); continue }
    if (bi >= bLines.length) { result.push({ type: 'removed', text: aLines[ai++] }); continue }
    if (aLines[ai] === bLines[bi]) { result.push({ type: 'unchanged', text: aLines[ai] }); ai++; bi++; continue }
    const bAhead = bLines.slice(bi, bi + 8).indexOf(aLines[ai])
    const aAhead = aLines.slice(ai, ai + 8).indexOf(bLines[bi])
    if (bAhead === -1 && aAhead === -1) {
      result.push({ type: 'removed', text: aLines[ai++] })
      result.push({ type: 'added', text: bLines[bi++] })
    } else if (bAhead !== -1 && (aAhead === -1 || bAhead <= aAhead)) {
      result.push({ type: 'added', text: bLines[bi++] })
    } else {
      result.push({ type: 'removed', text: aLines[ai++] })
    }
  }
  return result
}

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

function fmtTime(isoBase: string, offsetSec: number): string {
  const d = new Date(new Date(isoBase).getTime() + offsetSec * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  const sz = size === 'md' ? 'w-3 h-3' : 'w-2 h-2'
  return <span className={`inline-block rounded-full flex-shrink-0 ${sz} tl-${light}`} />
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
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[variant]}`}>{label}</span>
}

function SectionHeader({ label }: { label: string }) {
  return <p className="text-[10px] font-semibold tracking-[0.15em] text-vw-purple uppercase mb-3">{label}</p>
}

function CheckSectionTitle({
  icon, label, light, run, onRun, running, onToggle, isOpen,
}: {
  icon: string; label: string; light: TrafficLight; run?: WorkflowRun
  onRun?: () => void; running: boolean; onToggle?: () => void; isOpen?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 mb-2 ${onToggle ? 'cursor-pointer select-none' : ''}`}
      onClick={onToggle}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="flex-1 text-xs font-semibold text-gray-700">{label}</span>
      {light === 'running' || running
        ? <Spinner className="w-3 h-3 text-blue-500" />
        : <TrafficDot light={light} size="md" />}
      {run && (
        <a href={run.html_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          className="text-[10px] text-gray-400 hover:text-vw-purple">
          {timeAgo(run.created_at)}
        </a>
      )}
      {onRun && (
      <button
        onClick={e => { e.stopPropagation(); onRun() }}
        disabled={running}
        title="Run this check"
        className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-vw-purple hover:bg-vw-purple-light transition disabled:opacity-40"
      >
        ▶
      </button>
      )}
      {onToggle !== undefined && (
        <span className={`text-gray-400 text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      )}
    </div>
  )
}

// ── Publish Modal ─────────────────────────────────────────────────────────────

function PublishModal({ agentName, hasPr, onClose, onConfirm, loading }: {
  agentName: string; hasPr: boolean; onClose: () => void
  onConfirm: (maxIter: number, numTests: number) => void; loading: boolean
}) {
  const [maxIter, setMaxIter] = useState(30)
  const [numTests, setNumTests] = useState(10)
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-widest text-vw-purple uppercase mb-1">STAGE 3 OF 3 · PUBLISH</p>
          <h2 className="text-xl font-bold text-gray-900">{hasPr ? 'Update pull request' : 'Create pull request'}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {hasPr ? `Push changes to the open PR for ${toDisplayName(agentName)}` : `Open a draft PR for ${toDisplayName(agentName)} and trigger CI`}
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Expected max iterations<RequiredBadge /></label>
            <input type="number" min={1} max={100} value={maxIter} onChange={e => setMaxIter(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-vw-purple/30 focus:border-vw-purple transition" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Number of test cases to generate<RequiredBadge /></label>
            <input type="number" min={3} max={50} value={numTests} onChange={e => setNumTests(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-vw-purple/30 focus:border-vw-purple transition" />
            <p className="mt-1 text-xs text-gray-400">Eval cases auto-generated by <code className="bg-gray-100 px-1 rounded">generate-eval-set.yml</code>.</p>
          </div>
        </div>
        <div className="mt-6 flex gap-2.5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={() => onConfirm(maxIter, numTests)} disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-vw-purple text-white text-sm font-semibold hover:bg-vw-purple-dark transition flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <><Spinner className="w-4 h-4 text-white" />Creating…</> : <>{hasPr ? 'Update PR' : 'Create draft PR'} →</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Skill Editor Modal ────────────────────────────────────────────────────────

function SkillModal({ skillName, content: initialContent, loading, onClose, onSave }: {
  agentName: string; skillName: string; content: string; loading: boolean
  onClose: () => void; onSave: (content: string) => void
}) {
  const [draft, setDraft] = useState(initialContent)
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold tracking-widest text-vw-purple uppercase mb-0.5">SKILL</p>
          <h3 className="text-lg font-bold text-gray-900">{skillName}</h3>
        </div>
        <textarea className="flex-1 p-5 text-sm font-mono text-gray-800 resize-none focus:outline-none overflow-y-auto"
          value={draft} onChange={e => setDraft(e.target.value)} spellCheck={false} />
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2.5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={() => onSave(draft)} disabled={loading || draft === initialContent}
            className="flex-1 px-4 py-2 rounded-lg bg-vw-purple text-white text-sm font-semibold hover:bg-vw-purple-dark transition disabled:opacity-50">
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Quality check: Formal Verification ───────────────────────────────────────

interface VerifyRow { rule: string; name: string; status: 'PASS' | 'WARN' | 'FAIL' | 'N/A'; finding: string }

function parseVerifyComment(body: string): VerifyRow[] | null {
  if (!body.includes('Static Verification Report')) return null
  const rows: VerifyRow[] = []
  for (const line of body.split('\n')) {
    const m = line.match(/\|\s*`(P\d+)[^`]*`\s*\|\s*([^|]+)\|\s*(✅|⚠️|❌|➖)\s*(PASS|WARN|FAIL|N\/A)\s*\|\s*([^|]+)\|/)
    if (m) rows.push({ rule: m[1], name: m[2].trim(), status: m[4] as VerifyRow['status'], finding: m[5].trim() })
  }
  return rows.length > 0 ? rows : null
}

const STATUS_CHIP: Record<string, string> = {
  PASS: 'bg-green-50 text-green-700',
  WARN: 'bg-amber-50 text-amber-700',
  FAIL: 'bg-red-50 text-red-700',
  'N/A': 'bg-gray-100 text-gray-400',
}
const STATUS_ICON: Record<string, string> = { PASS: '✅', WARN: '⚠️', FAIL: '❌', 'N/A': '➖' }

const FORMAL_CHECKS = [
  { rule: 'P1',  name: 'NO_CREDENTIALS',        short: 'No embedded credentials' },
  { rule: 'P2',  name: 'NO_SELF_DISCLOSURE',     short: 'No "reveal prompt" directives' },
  { rule: 'P7',  name: 'NO_INJECTION_PAYLOAD',   short: 'No injection code in file' },
  { rule: 'P3',  name: 'ROLE_CLARITY',           short: 'Role is unambiguous' },
  { rule: 'P4',  name: 'BEHAVIORAL_BOUNDARIES',  short: 'Explicit constraints defined' },
  { rule: 'P5',  name: 'INTERNAL_CONSISTENCY',   short: 'No contradictions' },
  { rule: 'P6',  name: 'SAFETY_GUARDRAILS',      short: 'No harmful instructions' },
  { rule: 'P8',  name: 'INJECTION_RESILIENCE',   short: 'Resists user overrides' },
  { rule: 'P9',  name: 'NO_EXFILTRATION',        short: 'No user-data leakage' },
  { rule: 'P10', name: 'TOOL_CALL_SAFETY',       short: 'Tool/API use is constrained' },
  { rule: 'P11', name: 'IP_PROTECTION',          short: 'Expertise not trivially copyable' },
  { rule: 'P12', name: 'EU_AI_ACT_ART50',        short: 'AI disclosure (Art. 50)' },
  { rule: 'P13', name: 'LIABILITY_PROTECTION',   short: 'Disclaimers in advisory domains' },
] as const

function FormalVerificationSection({ comments, workflowRuns, onApplyChanges, applyLoading, onRun, runDispatching, collapsed, currentPrompt, onLoadRemediation }: {
  comments: PRComment[]; workflowRuns: WorkflowRun[]; onApplyChanges: () => void
  applyLoading: boolean; onRun: () => void; runDispatching: boolean; collapsed?: boolean
  currentPrompt: string; onLoadRemediation: () => Promise<string | null>
}) {
  const [remediatedPrompt, setRemediatedPrompt] = useState<string | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)

  const verifyComment = comments
    .filter(c => c.body.includes('Static Verification Report'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const verifyRun = workflowRuns.filter(r => r.workflowType === 'verify')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const rows = verifyComment ? parseVerifyComment(verifyComment.body) : null
  const hasRemediation = verifyComment?.body.includes('auto-remediation committed')
  const light = workflowLight(workflowRuns, 'verify')
  const rowMap = new Map(rows?.map(r => [r.rule, r]) ?? [])

  const handleViewChanges = async () => {
    setLoadingDiff(true)
    const prompt = await onLoadRemediation()
    setRemediatedPrompt(prompt)
    setShowDiff(true)
    setLoadingDiff(false)
  }

  const diff = (remediatedPrompt && showDiff) ? diffLines(currentPrompt, remediatedPrompt) : null
  const hasActualChanges = diff?.some(l => l.type !== 'unchanged') ?? false
  const failedChecks = rows?.filter(r => r.status === 'FAIL' || r.status === 'WARN') ?? []

  return (
    <div className="pb-4 border-b border-gray-100">
      <CheckSectionTitle icon="🔍" label="Formal Verification" light={light} run={verifyRun} onRun={onRun} running={runDispatching} />
      {!collapsed && (
        <div className="space-y-0.5 mt-1">
          {FORMAL_CHECKS.map(check => {
            const result = rowMap.get(check.rule)
            const isExpanded = expandedRule === check.rule
            const hasFinding = result?.finding && result.finding !== '—'
            const clickable = !!result
            return (
              <div key={check.rule}>
                <div
                  onClick={() => clickable && setExpandedRule(isExpanded ? null : check.rule)}
                  className={`flex items-start gap-2 px-2 py-1 rounded-lg ${clickable ? 'cursor-pointer hover:bg-gray-50' : ''} ${isExpanded ? 'bg-gray-50' : ''}`}
                >
                  <span className="font-mono text-[10px] text-gray-400 w-7 flex-shrink-0 mt-0.5">{check.rule}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 leading-tight">{check.short}</p>
                    {!isExpanded && hasFinding && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{result!.finding}</p>
                    )}
                  </div>
                  {result ? (
                    <span className={`flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_CHIP[result.status]}`}>
                      {STATUS_ICON[result.status]} {result.status}
                    </span>
                  ) : (
                    <span className="flex-shrink-0 text-[9px] text-gray-300 w-10 text-center">—</span>
                  )}
                </div>
                {isExpanded && hasFinding && (
                  <div className={`mx-2 mb-1 px-2 py-1.5 rounded-b-lg text-[10px] leading-relaxed border-l-2 ${
                    result!.status === 'FAIL' ? 'border-red-300 bg-red-50 text-red-800' :
                    result!.status === 'WARN' ? 'border-amber-300 bg-amber-50 text-amber-800' :
                    'border-gray-200 bg-gray-50 text-gray-600'
                  }`}>
                    {result!.finding}
                  </div>
                )}
              </div>
            )
          })}

          {hasRemediation && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="text-amber-600 text-xs">🔧</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-amber-800">Auto-remediation committed</p>
                  {failedChecks.length > 0 && (
                    <p className="text-[9px] text-amber-600">
                      Fixed: {failedChecks.map(r => r.rule).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {!showDiff && (
                    <button onClick={handleViewChanges} disabled={loadingDiff}
                      className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-semibold rounded hover:bg-amber-200 transition disabled:opacity-50">
                      {loadingDiff ? '…' : 'View Changes'}
                    </button>
                  )}
                  {showDiff && (
                    <button onClick={() => setShowDiff(false)}
                      className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-semibold rounded hover:bg-amber-200 transition">
                      Hide
                    </button>
                  )}
                  <button onClick={onApplyChanges} disabled={applyLoading}
                    className="px-2 py-0.5 bg-vw-purple text-white text-[9px] font-semibold rounded hover:bg-vw-purple-dark transition disabled:opacity-50">
                    {applyLoading ? '…' : 'Apply →'}
                  </button>
                </div>
              </div>

              {showDiff && diff && (
                <div className="border-t border-amber-200 max-h-64 overflow-y-auto">
                  {!hasActualChanges ? (
                    <p className="text-[10px] text-gray-400 px-3 py-2 italic">No text changes detected.</p>
                  ) : (
                    <pre className="text-[9px] leading-relaxed font-mono p-2 whitespace-pre-wrap break-words">
                      {diff.map((line, i) => (
                        <div key={i} className={
                          line.type === 'added' ? 'bg-green-50 text-green-800' :
                          line.type === 'removed' ? 'bg-red-50 text-red-700 line-through opacity-70' :
                          'text-gray-500'
                        }>
                          <span className="select-none mr-1 opacity-40">
                            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                          </span>
                          {line.text}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Quality check: Simulated Users ───────────────────────────────────────────

function SimulatedUsersSection({ agentName, onRun, runDispatching, collapsed }: {
  agentName: string; onRun: () => void; runDispatching: boolean; collapsed?: boolean
}) {
  const [status, setStatus] = useState<{ exists: boolean; count: number | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/agents/${agentName}/eval-set`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ exists: false, count: null }))
      .finally(() => setLoading(false))
  }, [agentName])

  const light: TrafficLight = loading ? 'none' : status?.exists ? 'pass' : 'fail'

  return (
    <div className="pb-4 border-b border-gray-100">
      <CheckSectionTitle icon="👥" label="Simulated Users" light={light} onRun={onRun} running={runDispatching} />
      {!collapsed && (
        <div className="pl-5">
          {loading ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-400"><Spinner className="w-3 h-3" /> Checking…</div>
          ) : status?.exists ? (
            <p className="text-xs text-gray-600">
              ✅ Eval set found
              {status.count !== null && <span className="ml-1 text-gray-400">· {status.count} test cases</span>}
            </p>
          ) : (
            <p className="text-xs text-gray-400 italic">No eval set in repo — run to generate.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Quality check: Chat Logs ──────────────────────────────────────────────────

function ChatLogsSection({ agentName, prBranch, workflowRuns, onRun, runDispatching, open, onToggle }: {
  agentName: string; prBranch: string | null; workflowRuns: WorkflowRun[]
  onRun: () => void; runDispatching: boolean; open: boolean; onToggle: () => void
}) {
  const [logFiles, setLogFiles] = useState<string[]>([])
  const [selectedLog, setSelectedLog] = useState<string | null>(null)
  const [evalLog, setEvalLog] = useState<EvalLog | null>(null)
  const [selectedGame, setSelectedGame] = useState<number>(0)
  const [listLoading, setListLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const bubbleRef = useRef<HTMLDivElement>(null)

  const ref = prBranch ?? 'main'
  const light = workflowLight(workflowRuns, 'agent-eval')
  const evalRun = workflowRuns.filter(r => r.workflowType === 'agent-eval')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  useEffect(() => {
    if (!open) return
    setListLoading(true)
    fetch(`/api/agents/${agentName}/logs?ref=${encodeURIComponent(ref)}`)
      .then(r => r.json())
      .then((data: unknown) => {
        const files = Array.isArray(data) ? data as string[] : []
        setLogFiles(files)
        if (files.length > 0 && !selectedLog) setSelectedLog(files[0])
      })
      .catch(() => {})
      .finally(() => setListLoading(false))
  }, [agentName, ref, open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedLog || !open) return
    setLoading(true)
    fetch(`/api/agents/${agentName}/logs?ref=${encodeURIComponent(ref)}&file=${encodeURIComponent(selectedLog)}`)
      .then(r => r.json())
      .then((data: EvalLog) => { setEvalLog(data); setSelectedGame(0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentName, ref, selectedLog, open])

  useEffect(() => {
    if (bubbleRef.current) bubbleRef.current.scrollTop = 0
  }, [selectedGame])

  const game = evalLog?.games[selectedGame]
  const baseTime = evalLog?.evaluated_at ?? new Date().toISOString()

  return (
    <div className="pb-4 border-b border-gray-100">
      <CheckSectionTitle
        icon="💬" label="Chat Logs" light={light} run={evalRun}
        onRun={onRun} running={runDispatching}
        onToggle={onToggle} isOpen={open}
      />

      {open && (
        <div className="mt-1">
          {listLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 pl-5 py-1">
              <Spinner className="w-3 h-3" /> Loading logs…
            </div>
          ) : !evalRun && logFiles.length === 0 ? (
            <p className="text-xs text-gray-400 italic pl-5">No eval runs yet.</p>
          ) : logFiles.length === 0 ? (
            <p className="text-xs text-gray-400 italic pl-5">No logs found for this branch.</p>
          ) : (
            <>
              {logFiles.length > 1 && (
                <select value={selectedLog ?? ''} onChange={e => setSelectedLog(e.target.value)}
                  className="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-1 focus:ring-vw-purple/40 text-gray-600">
                  {logFiles.map(f => <option key={f} value={f}>{f.split('/').pop()?.slice(0, 32)}</option>)}
                </select>
              )}

              {loading && <p className="text-xs text-gray-400 text-center py-3">Loading…</p>}

              {evalLog && evalLog.games.length > 0 && !loading && (
                <div className="border border-gray-100 rounded-xl overflow-hidden flex" style={{ height: '360px' }}>
                  <div className="w-16 flex-shrink-0 border-r border-gray-100 overflow-y-auto bg-gray-50/60">
                    {evalLog.games.map((g, i) => (
                      <button key={g.id} onClick={() => setSelectedGame(i)}
                        className={`w-full flex flex-col items-center py-2.5 gap-1 border-b border-gray-100 transition text-center last:border-b-0 ${
                          i === selectedGame ? 'bg-vw-purple-light' : 'hover:bg-gray-100'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${g.success ? 'bg-green-500' : 'bg-red-400'}`} />
                        <span className={`text-[9px] font-semibold ${i === selectedGame ? 'text-vw-purple' : 'text-gray-500'}`}>
                          #{g.id}
                        </span>
                        <span className="text-[8px] text-gray-400">{g.iterations}it</span>
                      </button>
                    ))}
                  </div>

                  <div ref={bubbleRef} className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2 bg-white">
                    {game?.transcript.map((msg, i) => {
                      const ts = fmtTime(baseTime, i * 22)
                      const isUser = msg.role === 'user'
                      return (
                        <div key={i} className={`flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
                          <span className="text-[9px] font-semibold text-gray-400 px-1">
                            {isUser ? 'User' : 'Agent'}
                          </span>
                          <div className={isUser ? 'bubble-user' : 'bubble-agent'} style={{ maxWidth: '90%' }}>
                            {msg.text}
                          </div>
                          <span className="text-[9px] text-gray-400 px-1">{ts}</span>
                        </div>
                      )
                    })}
                    {game?.error && (
                      <div className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">{game.error}</div>
                    )}
                    {game && (
                      <div className="text-[9px] text-center text-gray-400 mt-1 pb-1">
                        {game.success ? '✓' : '✗'} {game.iterations} iter · {game.tokens_used.toLocaleString()} tok
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Quality check: Analyse and Improve ───────────────────────────────────────

function AnalyseAndImproveSection({ comments, workflowRuns, onRun, runDispatching, collapsed, isAuto, maxLogs, onToggleAuto, onChangeMaxLogs }: {
  comments: PRComment[]; workflowRuns: WorkflowRun[]; onRun: () => void; runDispatching: boolean; collapsed?: boolean
  isAuto: boolean; maxLogs: number; onToggleAuto: () => void; onChangeMaxLogs: (n: number) => void
}) {
  const run = workflowRuns.filter(r => r.workflowType === 'auto-analyze')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const light = workflowLight(workflowRuns, 'auto-analyze')
  const improvePrLink = (() => {
    for (const c of comments) {
      const m = c.body.match(/\bhttps:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)\b/)
      if (m && c.body.toLowerCase().includes('improv')) return m[0]
    }
    return null
  })()

  // Rough cost indicator: each conversation ≈ 8k tokens at ~$0.14/Mtok (DeepSeek)
  const costLabel = maxLogs <= 3 ? 'low cost' : maxLogs <= 8 ? 'moderate cost' : 'higher cost'
  const costColor = maxLogs <= 3 ? 'text-green-600' : maxLogs <= 8 ? 'text-amber-600' : 'text-red-500'

  return (
    <div>
      <CheckSectionTitle
        icon="🔄"
        label="Analyse and Improve"
        light={light}
        run={run}
        onRun={isAuto ? undefined : onRun}
        running={runDispatching}
      />
      {!collapsed && (
        <div className="pl-2 space-y-2 mt-1">
          {/* Manual / Auto toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Trigger:</span>
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-[10px] font-semibold">
              <button
                onClick={() => isAuto && onToggleAuto()}
                className={`px-2.5 py-1 transition ${!isAuto ? 'bg-vw-purple text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                Manual
              </button>
              <button
                onClick={() => !isAuto && onToggleAuto()}
                className={`px-2.5 py-1 transition ${isAuto ? 'bg-vw-purple text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                Auto
              </button>
            </div>
          </div>

          {/* Auto config */}
          {isAuto && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold text-gray-700 flex-1">Conversations to analyse</label>
                <input
                  type="number" min={1} max={20} value={maxLogs}
                  onChange={e => onChangeMaxLogs(Math.max(1, Math.min(20, Number(e.target.value))))}
                  className="w-14 px-2 py-1 border border-gray-200 rounded text-[10px] text-center focus:outline-none focus:ring-1 focus:ring-vw-purple/30"
                />
              </div>
              <p className={`text-[9px] ${costColor}`}>
                ~{maxLogs} conversation{maxLogs !== 1 ? 's' : ''} · {costLabel}
              </p>
              <p className="text-[9px] text-gray-400 leading-snug">
                Fires automatically on the next eval run. More conversations = deeper analysis but higher LLM cost.
              </p>
            </div>
          )}

          {/* Manual: show run status */}
          {!run ? (
            isAuto
              ? <p className="text-[10px] text-gray-400 italic">Waiting for next eval to trigger analysis.</p>
              : <p className="text-[10px] text-gray-400 italic">No run yet — click ▶ above to trigger.</p>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] text-gray-600">
                {run.status !== 'completed' ? 'Analysing eval results…' :
                 run.conclusion === 'success' ? '✓ Analysis complete' : '✗ Analysis failed'}
              </p>
              {improvePrLink && (
                <a href={improvePrLink} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-vw-purple bg-vw-purple-light px-2 py-1 rounded-full hover:bg-vw-purple/20 transition">
                  View improvement PR →
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Right sidebar: Quality Checks ────────────────────────────────────────────

function QualityChecksSidebar({ agentData, workflowRuns, comments, onApplyVerifyChanges, applyLoading }: {
  agentData: AgentData; workflowRuns: WorkflowRun[]; comments: PRComment[]
  onApplyVerifyChanges: () => void; applyLoading: boolean
}) {
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({})
  const [dispatchMsg, setDispatchMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [chatLogsOpen, setChatLogsOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(440)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  // Eval thresholds — initialize from last run's recorded thresholds if available
  const [minSuccessRate, setMinSuccessRate] = useState<number>(
    agentData.qualityScore?.thresholds_used?.min_success_rate ?? 50
  )
  const [maxAvgIter, setMaxAvgIter] = useState<number>(
    agentData.qualityScore?.thresholds_used?.max_avg_iterations ?? 30
  )

  // Auto-analyse settings
  const [autoAnalyze, setAutoAnalyze] = useState(false)
  const [maxLogs, setMaxLogs] = useState(5)

  // Track last eval conclusion to detect transition to success for auto-dispatch
  const prevEvalConclusionRef = useRef<string | null | undefined>(undefined)
  const evalRun = workflowRuns
    .filter(r => r.workflowType === 'agent-eval')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  useEffect(() => {
    const prev = prevEvalConclusionRef.current
    const curr = evalRun?.conclusion
    if (autoAnalyze && prev !== undefined && prev !== 'success' && curr === 'success') {
      dispatch('auto-analyze.yml', { agent_name: agentData.name, max_logs: String(maxLogs) })
    }
    prevEvalConclusionRef.current = curr
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalRun?.conclusion, autoAnalyze])

  const dispatch = async (workflow: string, inputs?: Record<string, string>) => {
    if (!agentData) return
    setDispatching(p => ({ ...p, [workflow]: true }))
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow, ref: 'main', inputs }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setDispatchMsg({ ok: false, text: data.error ?? `HTTP ${res.status}` })
    } catch (e) {
      setDispatchMsg({ ok: false, text: String(e) })
    } finally {
      setDispatching(p => ({ ...p, [workflow]: false }))
    }
  }

  const runAll = async () => {
    if (!agentData) return
    setDispatchMsg(null)
    const agent = agentData.name

    // 1. Verify — always; pass PR branch so workflow checks out the right code
    dispatch('verify-prompt.yml', { agent, ref: agentData.prBranch ?? 'main' })

    // 2. Check webhook before running eval
    const { configured: hasWebhook } = await fetch(`/api/agents/${agent}/webhook-status`)
      .then(r => r.json()).catch(() => ({ configured: false }))

    if (!hasWebhook) {
      setDispatchMsg({ ok: false, text: 'No N8N webhook URL configured — eval skipped. Set N8N_AGENT_WEBHOOK_URL in .env.local.' })
      return
    }

    // 3. Generate eval set only if missing
    const { exists: evalSetExists } = await fetch(`/api/agents/${agent}/eval-set`)
      .then(r => r.json()).catch(() => ({ exists: false }))
    if (!evalSetExists) dispatch('generate-eval-set.yml', { agent_name: agent })

    // 4. Eval — only if webhook available
    dispatch('agent-eval.yml', {
      agent_name: agent,
      min_success_rate: String(minSuccessRate),
      max_avg_iterations: String(maxAvgIter),
    })

    setDispatchMsg({ ok: true, text: 'Workflows dispatched — results will appear shortly.' })
    setTimeout(() => setDispatchMsg(null), 5000)
  }

  const loadRemediatedPrompt = async (): Promise<string | null> => {
    if (!agentData?.prBranch) return null
    try {
      const data = await fetch(`/api/agents/${agentData.name}?branch=${encodeURIComponent(agentData.prBranch)}`).then(r => r.json())
      return data.prompt ?? null
    } catch { return null }
  }

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startW: sidebarWidth }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - ev.clientX
      setSidebarWidth(Math.max(280, Math.min(700, dragRef.current.startW + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const overallLight = runsToLight(workflowRuns)

  return (
    <aside
      className="flex-shrink-0 border-l border-gray-200 flex flex-col overflow-hidden bg-white relative"
      style={{ width: sidebarWidth }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-vw-purple/30 transition-colors z-10"
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-vw-purple uppercase flex-1">
            Quality Checks
          </p>
          {overallLight === 'running'
            ? <Spinner className="w-3 h-3 text-blue-500" />
            : <TrafficDot light={overallLight} size="md" />}
          <button
            onClick={runAll}
            title="Verify + eval (auto-analyze is manual)"
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-vw-purple bg-vw-purple-light rounded-lg hover:bg-vw-purple/20 transition"
          >
            ▶ Run all
          </button>
        </div>
        {dispatchMsg && (
          <p className={`mt-1.5 text-[10px] px-2 py-1 rounded ${dispatchMsg.ok ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
            {dispatchMsg.text}
          </p>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-0">

        {/* Eval Settings */}
        <div className="pb-4 border-b border-gray-100 mb-1">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="w-full flex items-center gap-2 text-[10px] font-semibold text-gray-500 uppercase tracking-[0.12em] hover:text-gray-700 transition mb-1"
          >
            <span className="flex-1 text-left">⚙ Eval Settings</span>
            <span className={`transition-transform duration-150 ${settingsOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {settingsOpen && (
            <div className="space-y-2 mt-2">
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-1">
                  Min success rate (%)
                  <span className="ml-1 text-gray-400 font-normal">— first-run pass threshold</span>
                </label>
                <input
                  type="number" min={0} max={100} value={minSuccessRate}
                  onChange={e => setMinSuccessRate(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-vw-purple/30 focus:border-vw-purple"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-1">
                  Target max avg iterations
                  <span className="ml-1 text-gray-400 font-normal">— lower = faster agent</span>
                </label>
                <input
                  type="number" min={1} max={100} value={maxAvgIter}
                  onChange={e => setMaxAvgIter(Math.max(1, Number(e.target.value)))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-vw-purple/30 focus:border-vw-purple"
                />
              </div>
              {agentData.qualityScore?.thresholds_used && (
                <p className="text-[9px] text-gray-400">
                  Last run used: ≥{agentData.qualityScore.thresholds_used.min_success_rate}% success, ≤{agentData.qualityScore.thresholds_used.max_avg_iterations} avg iter
                </p>
              )}
            </div>
          )}
        </div>

        <FormalVerificationSection
          comments={comments}
          workflowRuns={workflowRuns}
          onApplyChanges={onApplyVerifyChanges}
          applyLoading={applyLoading}
          onRun={() => dispatch('verify-prompt.yml', { agent: agentData.name, ref: agentData.prBranch ?? 'main' })}
          runDispatching={!!dispatching['verify-prompt.yml']}
          collapsed={chatLogsOpen}
          currentPrompt={agentData.prompt}
          onLoadRemediation={loadRemediatedPrompt}
        />
        <div className="pt-4">
          <SimulatedUsersSection
            agentName={agentData.name}
            onRun={() => dispatch('generate-eval-set.yml')}
            runDispatching={!!dispatching['generate-eval-set.yml']}
            collapsed={chatLogsOpen}
          />
        </div>
        <div className="pt-4">
          <ChatLogsSection
            agentName={agentData.name}
            prBranch={agentData.prBranch}
            workflowRuns={workflowRuns}
            onRun={() => dispatch('agent-eval.yml', { agent_name: agentData.name, min_success_rate: String(minSuccessRate), max_avg_iterations: String(maxAvgIter) })}
            runDispatching={!!dispatching['agent-eval.yml']}
            open={chatLogsOpen}
            onToggle={() => setChatLogsOpen(v => !v)}
          />
        </div>
        <div className="pt-4">
          <AnalyseAndImproveSection
            comments={comments}
            workflowRuns={workflowRuns}
            onRun={() => dispatch('auto-analyze.yml', { agent_name: agentData.name, max_logs: String(maxLogs) })}
            runDispatching={!!dispatching['auto-analyze.yml']}
            collapsed={chatLogsOpen}
            isAuto={autoAnalyze}
            maxLogs={maxLogs}
            onToggleAuto={() => setAutoAnalyze(v => !v)}
            onChangeMaxLogs={setMaxLogs}
          />
        </div>
      </div>
    </aside>
  )
}

// ── Preview: live chat ────────────────────────────────────────────────────────

interface ChatMsg { role: 'user' | 'agent'; text: string; ts: number }

function PreviewChat({ agentData, onImprove }: { agentData: AgentData; onImprove: (p: string) => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [improving, setImproving] = useState(false)
  const [improveError, setImproveError] = useState<string | null>(null)
  const [sessionId] = useState(() => `preview-${agentData.name}-${Math.random().toString(36).slice(2)}`)
  const bottomRef = useRef<HTMLDivElement>(null)
  const agentLabel = toDisplayName(agentData.name)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }])
    setInput('')
    setSending(true)
    try {
      const res = await fetch(`/api/agents/${agentData.name}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      })
      const data = await res.json()
      const reply: string = data.reply ?? data.error ?? 'No response.'
      setMessages(prev => [...prev, { role: 'agent', text: reply, ts: Date.now() }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'agent', text: `Network error: ${e}`, ts: Date.now() }])
    } finally {
      setSending(false)
    }
  }

  const handleImprove = async () => {
    if (messages.length === 0 || improving) return
    setImproving(true)
    setImproveError(null)
    try {
      const res = await fetch(`/api/agents/${agentData.name}/improve-from-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, text: m.text })),
          currentPrompt: agentData.prompt,
        }),
      })
      const data = await res.json()
      if (data.prompt) {
        onImprove(data.prompt)
      } else {
        setImproveError(data.error ?? 'Failed to generate improvements.')
      }
    } catch (e) {
      setImproveError(String(e))
    } finally {
      setImproving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-vw-purple uppercase mb-0.5">
              PREVIEW · LIVE CHAT
            </p>
            <h2 className="text-lg font-bold text-gray-900">{agentLabel}</h2>
          </div>
          <button
            onClick={handleImprove}
            disabled={messages.length === 0 || improving || sending}
            title={messages.length === 0 ? 'Start a conversation first' : 'Use this conversation to generate an improved system prompt'}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-vw-purple/30 text-xs font-semibold text-vw-purple hover:bg-vw-purple-light transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {improving ? <><Spinner className="w-3 h-3" /> Improving…</> : '✨ Use this chat to improve the answers'}
          </button>
        </div>
        {improveError && (
          <p className="mt-2 text-[11px] text-red-500 bg-red-50 rounded-lg px-3 py-1.5">{improveError}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-12 h-12 rounded-2xl bg-vw-purple-light flex items-center justify-center mb-3">
              <span className="text-xl">💬</span>
            </div>
            <p className="text-sm text-gray-500">Say something to {agentLabel}…</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          return (
            <div key={i} className={`flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] font-semibold text-gray-500 px-1">
                {isUser ? 'You' : agentLabel}
              </span>
              <div className={isUser ? 'bubble-user' : 'bubble-agent'} style={{ maxWidth: '75%' }}>
                {msg.text}
              </div>
              <span className="text-[9px] text-gray-400 px-1">
                {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )
        })}
        {sending && (
          <div className="flex flex-col gap-0.5 items-start">
            <span className="text-[10px] font-semibold text-gray-500 px-1">{agentLabel}</span>
            <div className="bubble-agent flex items-center gap-2">
              <Spinner className="w-3 h-3 text-vw-purple" />
              <span className="text-xs text-gray-500">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-6 py-4 border-t border-gray-100 flex gap-3 items-end flex-shrink-0">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={sending}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-vw-purple/30 focus:border-vw-purple transition"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="px-4 py-2.5 bg-vw-purple text-white text-sm font-semibold rounded-xl hover:bg-vw-purple-dark transition disabled:opacity-50 flex-shrink-0 h-10 flex items-center"
        >
          Send →
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentForge() {
  const [agents, setAgents] = useState<string[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [agentData, setAgentData] = useState<AgentData | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)

  const [promptDraft, setPromptDraft] = useState('')
  const [skillDrafts, setSkillDrafts] = useState<Record<string, string>>({})
  const [skillModal, setSkillModal] = useState<{ name: string; content: string } | null>(null)
  const [skillLoadingName, setSkillLoadingName] = useState<string | null>(null)
  const [addingSkill, setAddingSkill] = useState<string | null>(null)

  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([])
  const [comments, setComments] = useState<PRComment[]>([])
  const [agentLights, setAgentLights] = useState<Record<string, TrafficLight>>({})

  const [activeTab, setActiveTab] = useState<'Create' | 'Configure' | 'Preview'>('Configure')

  // Create tab state
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentPrompt, setNewAgentPrompt] = useState('You are a helpful agent.')
  const [createError, setCreateError] = useState<string | null>(null)
  const [newSkillDrafts, setNewSkillDrafts] = useState<Record<string, string>>({})
  const [newAddingSkill, setNewAddingSkill] = useState<string | null>(null)

  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)
  const [applyLoading, setApplyLoading] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isDirty = agentData !== null && (
    promptDraft !== agentData.prompt || Object.keys(skillDrafts).length > 0
  )

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true)
    const data = await fetch('/api/agents').then(r => r.json()).catch(() => [])
    setAgents(Array.isArray(data) ? data : [])
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

      const branch = data.prBranch ?? 'main'
      const runsData = await fetch(`/api/workflows?branch=${encodeURIComponent(branch)}`).then(r => r.json()).catch(() => [])
      setWorkflowRuns(Array.isArray(runsData) ? runsData : [])

      if (data.prNumber) {
        const comsData = await fetch(`/api/comments?pr=${data.prNumber}`).then(r => r.json()).catch(() => [])
        setComments(Array.isArray(comsData) ? comsData : [])
      }

      setAgentLights(prev => ({ ...prev, [name]: runsToLight(Array.isArray(runsData) ? runsData : []) }))
    } finally {
      setAgentLoading(false)
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      if (!agentData) return
      const branch = agentData.prBranch ?? 'main'
      const runs: WorkflowRun[] = await fetch(`/api/workflows?branch=${encodeURIComponent(branch)}`).then(r => r.json()).catch(() => [])
      setWorkflowRuns(Array.isArray(runs) ? runs : [])
      setAgentLights(prev => ({ ...prev, [agentData.name]: runsToLight(Array.isArray(runs) ? runs : []) }))
      if (runs.every(r => r.status === 'completed')) {
        clearInterval(pollRef.current!)
        pollRef.current = null
        if (agentData.prNumber) {
          const coms = await fetch(`/api/comments?pr=${agentData.prNumber}`).then(r => r.json()).catch(() => [])
          setComments(Array.isArray(coms) ? coms : [])
        }
      }
    }, 8_000)
  }, [agentData])

  useEffect(() => {
    const hasInProgress = workflowRuns.some(r => r.status !== 'completed')
    if (hasInProgress) startPolling()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [workflowRuns, startPolling])

  useEffect(() => { loadAgents() }, [loadAgents])
  useEffect(() => { if (selectedAgent) loadAgentData(selectedAgent) }, [selectedAgent, loadAgentData])

  const handleSkillClick = async (skillName: string) => {
    if (!agentData) return
    if (skillDrafts[skillName]) { setSkillModal({ name: skillName, content: skillDrafts[skillName] }); return }
    setSkillLoadingName(skillName)
    const data: SkillContent = await fetch(`/api/agents/${agentData.name}/skill/${encodeURIComponent(skillName)}`).then(r => r.json()).catch(() => ({ content: '', sha: '' }))
    setSkillLoadingName(null)
    setSkillModal({ name: skillName, content: data.content })
  }

  const handlePublishConfirm = async (maxIterations: number, numTests: number) => {
    if (!agentData) return
    setPublishLoading(true)
    try {
      const payload: CreatePrPayload = {
        agentName: agentData.name, promptContent: promptDraft, skillUpdates: skillDrafts,
        maxIterations, numTests, existingPrBranch: agentData.prBranch,
      }
      const result: CreatePrResult = await fetch('/api/pr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json())
      setShowPublishModal(false)
      setSkillDrafts({})
      await loadAgentData(agentData.name)
      window.open(
        `https://github.com/${process.env.NEXT_PUBLIC_GITHUB_OWNER}/${process.env.NEXT_PUBLIC_GITHUB_REPO}/pull/${result.prNumber}`,
        '_blank',
      )
    } finally {
      setPublishLoading(false)
    }
  }

  const handleCreateAgent = async (maxIterations: number, numTests: number) => {
    const slug = newAgentName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!slug) { setCreateError('Agent name is required.'); return }
    if (agents.includes(slug)) { setCreateError(`An agent named "${slug}" already exists.`); return }
    setPublishLoading(true)
    setCreateError(null)
    try {
      const payload: CreatePrPayload = {
        agentName: slug, promptContent: newAgentPrompt, skillUpdates: newSkillDrafts,
        maxIterations, numTests, existingPrBranch: null,
      }
      const result: CreatePrResult = await fetch('/api/pr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json())
      setShowPublishModal(false)
      await loadAgents()
      setSelectedAgent(slug)
      setActiveTab('Configure')
      setNewAgentName('')
      setNewAgentPrompt('You are a helpful agent.')
      setNewSkillDrafts({})
      setNewAddingSkill(null)
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
    try {
      const data: AgentData = await fetch(`/api/agents/${agentData.name}?branch=${encodeURIComponent(agentData.prBranch)}`).then(r => r.json())
      setPromptDraft(data.prompt)
    } catch {
      await loadAgentData(agentData.name)
    } finally {
      setApplyLoading(false)
    }
  }

  const displayName = selectedAgent ? toDisplayName(selectedAgent) : ''
  const hasPr = !!agentData?.prNumber

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">

      {/* Top bar */}
      <header className="flex items-center gap-4 px-5 h-14 border-b border-gray-200 flex-shrink-0">
        <VeWorldLogo />
        <div className="flex-1" />
        {selectedAgent && agentData && (
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
            <button onClick={() => setShowPublishModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-vw-lime text-gray-900 text-sm font-semibold rounded-lg hover:bg-vw-lime-dark transition shadow-sm">
              {hasPr ? 'Update PR' : 'Publish'} →
            </button>
          )}
          <button className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">× Exit</button>
        </div>
      </header>

      {/* Tab nav */}
      <div className="flex border-b border-gray-200 px-5 flex-shrink-0">
        {(['Create', 'Configure', 'Preview'] as const).map(t => (
          <button key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              t === activeTab
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600 cursor-pointer'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Body: three columns */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — hidden on Create tab */}
        <aside className={`w-56 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden bg-gray-50/50 ${activeTab === 'Create' ? 'hidden' : ''}`}>
          <div className="flex-1 overflow-y-auto p-4">
            <SectionHeader label="Agents" />
            {agentsLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400"><Spinner className="w-3.5 h-3.5" /> Loading…</div>
            ) : (
              <ul className="space-y-0.5">
                {agents.map(name => {
                  const isSelected = name === selectedAgent
                  const agLight = agentLights[name] ?? 'none'
                  return (
                    <li key={name}>
                      <button onClick={() => { if (name !== selectedAgent) setSelectedAgent(name) }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition ${isSelected ? 'bg-vw-purple-light text-vw-purple font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}>
                        {agLight === 'running' ? <Spinner className="w-2 h-2 text-blue-500 flex-shrink-0" /> : <TrafficDot light={agLight} />}
                        <span className="truncate">{toDisplayName(name)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

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
                        <a href={run.html_url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 text-xs text-gray-600 hover:text-vw-purple group">
                          {rl === 'running' ? <Spinner className="w-2 h-2 text-blue-500 flex-shrink-0" /> : <TrafficDot light={rl} />}
                          <span className="truncate flex-1 group-hover:underline">{run.name}</span>
                          <span className="text-gray-400 flex-shrink-0 text-[10px]">{timeAgo(run.created_at)}</span>
                        </a>
                      </li>
                    )
                  })}
              </ul>
            </div>
          )}
        </aside>

        {activeTab === 'Create' ? (
          /* Create tab */
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.15em] text-vw-purple uppercase mb-1">NEW AGENT</p>
                <h1 className="text-2xl font-bold text-gray-900">Create an agent</h1>
                <p className="text-sm text-gray-400 mt-1">Give it a name and a starting prompt. Skills can be added later.</p>
              </div>

              {/* Agent name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Agent name <RequiredBadge />
                </label>
                <input
                  type="text"
                  value={newAgentName}
                  onChange={e => { setNewAgentName(e.target.value); setCreateError(null) }}
                  placeholder="e.g. my-agent"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-vw-purple/30 focus:border-vw-purple transition bg-white"
                />
                {newAgentName.trim() && (
                  <p className="mt-1 text-xs text-gray-400">
                    Slug: <span className="font-mono">{newAgentName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}</span>
                  </p>
                )}
                {createError && <p className="mt-1 text-xs text-red-500">{createError}</p>}
              </div>

              {/* System prompt */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  System prompt <RequiredBadge />
                </label>
                <textarea
                  value={newAgentPrompt}
                  onChange={e => setNewAgentPrompt(e.target.value)}
                  spellCheck={false}
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-vw-purple/30 focus:border-vw-purple transition bg-white leading-relaxed"
                  placeholder="You are a helpful agent."
                />
                <p className="mt-1 text-xs text-gray-400 text-right">{newAgentPrompt.length.toLocaleString()} chars</p>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Skills</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {Object.keys(newSkillDrafts).map(skill => (
                    <button key={skill}
                      onClick={() => setSkillModal({ name: skill, content: newSkillDrafts[skill] })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border bg-vw-purple text-white border-vw-purple">
                      <span>⚡</span>
                      {skill.replace('.md', '')}
                      <span className="text-white/70 text-[10px]">added</span>
                    </button>
                  ))}
                  {newAddingSkill !== null ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={newAddingSkill}
                        onChange={e => setNewAddingSkill(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const raw = newAddingSkill.trim()
                            if (!raw) { setNewAddingSkill(null); return }
                            const name = raw.endsWith('.md') ? raw : `${raw}.md`
                            setNewAddingSkill(null)
                            setSkillModal({ name, content: '' })
                          }
                          if (e.key === 'Escape') setNewAddingSkill(null)
                        }}
                        placeholder="skill-name"
                        className="px-2.5 py-1.5 text-xs border border-vw-purple/40 rounded-full focus:outline-none focus:ring-1 focus:ring-vw-purple/30 w-32 text-gray-700"
                      />
                      <span className="text-[10px] text-gray-400">↵ confirm</span>
                      <button onClick={() => setNewAddingSkill(null)} className="text-gray-400 hover:text-gray-600 text-xs leading-none">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setNewAddingSkill('')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 border-dashed border-gray-300 text-gray-400 hover:border-vw-purple hover:text-vw-purple transition"
                    >
                      + Add Skill
                    </button>
                  )}
                </div>
              </div>

              {/* CTA */}
              <div className="flex items-center justify-between p-4 bg-vw-purple-light border border-vw-purple/20 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-vw-purple">Ready to create?</p>
                  <p className="text-xs text-vw-purple/70 mt-0.5">Opens a draft PR and triggers CI.</p>
                </div>
                <button
                  onClick={() => {
                    const slug = newAgentName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                    if (!slug) { setCreateError('Agent name is required.'); return }
                    if (agents.includes(slug)) { setCreateError(`An agent named "${slug}" already exists.`); return }
                    setShowPublishModal(true)
                  }}
                  disabled={!newAgentName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-vw-purple text-white text-sm font-semibold rounded-lg hover:bg-vw-purple-dark transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Create draft PR →
                </button>
              </div>
            </div>
          </main>
        ) : activeTab === 'Preview' ? (
          /* Preview tab: live chat */
          <main className="flex-1 overflow-hidden">
            {!selectedAgent ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-vw-purple-light flex items-center justify-center mb-4">
                  <span className="text-2xl">💬</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Select an agent</h2>
                <p className="text-sm text-gray-500 max-w-xs">Choose an agent from the sidebar to start a live chat.</p>
              </div>
            ) : agentLoading ? (
              <div className="flex items-center justify-center h-64"><Spinner className="w-7 h-7 text-vw-purple" /></div>
            ) : agentData ? (
              <PreviewChat
                key={agentData.name}
                agentData={agentData}
                onImprove={newPrompt => { setPromptDraft(newPrompt); setActiveTab('Configure') }}
              />
            ) : null}
          </main>
        ) : (
        <>

        {/* Main editor */}
        <main className="flex-1 overflow-y-auto">
          {!selectedAgent ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-vw-purple-light flex items-center justify-center mb-4">
                <span className="text-2xl">🤖</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Select an agent</h2>
              <p className="text-sm text-gray-500 max-w-xs">Choose an agent from the sidebar to edit its system prompt, manage skills, and review quality checks.</p>
            </div>
          ) : agentLoading ? (
            <div className="flex items-center justify-center h-64"><Spinner className="w-7 h-7 text-vw-purple" /></div>
          ) : agentData ? (
            <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

              {/* Stage header */}
              <div>
                <p className="text-[10px] font-semibold tracking-[0.15em] text-vw-purple uppercase mb-1">
                  CONFIGURE · SYSTEM PROMPT
                  {hasPr && agentData.prNumber && (
                    <span className="ml-2 text-gray-400 normal-case tracking-normal">
                      PR <a href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_OWNER}/${process.env.NEXT_PUBLIC_GITHUB_REPO}/pull/${agentData.prNumber}`}
                        target="_blank" rel="noreferrer" className="underline">#{agentData.prNumber}</a> open
                    </span>
                  )}
                </p>
                <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
              </div>

              {/* Agent performance card */}
              {agentData.qualityScore && (() => {
                const qs = agentData.qualityScore!
                const rate = qs.success_rate ?? null
                const rateColor = rate === null ? 'text-gray-400' : rate >= 90 ? 'text-green-600' : rate >= 70 ? 'text-amber-500' : 'text-red-500'

                type MetricDef = { label: string; value: string; color: string }
                const metrics: MetricDef[] = []

                if (rate !== null) metrics.push({ label: 'Success rate', value: `${rate}%`, color: rateColor })
                if (qs.successful_games != null) metrics.push({ label: 'Needs satisfied', value: qs.total_games != null ? `${qs.successful_games}/${qs.total_games}` : String(qs.successful_games), color: 'text-gray-900' })
                if (qs.avg_iterations != null) metrics.push({ label: 'Avg iterations', value: (qs.avg_iterations as number).toFixed(1), color: 'text-gray-900' })
                if (qs.errored_games != null) metrics.push({ label: 'Errors', value: String(qs.errored_games), color: (qs.errored_games as number) > 0 ? 'text-red-500' : 'text-gray-400' })
                if (qs.valid_games != null && qs.total_games != null) metrics.push({ label: 'Valid games', value: `${qs.valid_games}/${qs.total_games}`, color: 'text-gray-900' })
                if (qs.total_tokens != null) metrics.push({ label: 'Total tokens', value: (qs.total_tokens as number).toLocaleString(), color: 'text-gray-900' })
                if (qs.tokens_per_game != null) metrics.push({ label: 'Tokens / game', value: Math.round(qs.tokens_per_game as number).toLocaleString(), color: 'text-gray-900' })
                // any extra numeric keys the eval might add
                const knownKeys = new Set(['model','total_games','valid_games','errored_games','successful_games','success_rate','avg_iterations','total_tokens','tokens_per_game'])
                Object.entries(qs).forEach(([k, v]) => {
                  if (!knownKeys.has(k) && typeof v === 'number') {
                    metrics.push({ label: k.replace(/_/g, ' '), value: Number.isInteger(v) ? String(v) : (v as number).toFixed(2), color: 'text-gray-900' })
                  }
                })

                return (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-semibold tracking-[0.15em] text-vw-purple uppercase">Your Agent Performance</p>
                      {qs.model && (
                        <span className="text-[10px] font-mono text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{String(qs.model)}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {metrics.map(s => (
                        <div key={s.label} className="bg-white rounded-lg border border-gray-100 px-3 py-2.5 text-center">
                          <p className={`text-base font-bold tabular-nums ${s.color}`}>{s.value}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Prompt editor */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  System prompt<RequiredBadge />
                  <span className="ml-2 text-gray-400 font-normal normal-case tracking-normal">agents/{agentData.name}/system-prompt.md</span>
                </label>
                <textarea value={promptDraft} onChange={e => setPromptDraft(e.target.value)} spellCheck={false}
                  className="w-full h-64 px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-vw-purple/30 focus:border-vw-purple transition bg-white leading-relaxed"
                  placeholder="Enter your system prompt…" />
                <p className="mt-1 text-xs text-gray-400 text-right">{promptDraft.length.toLocaleString()} chars</p>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Skills</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {agentData.skills.map(skill => {
                    const modified = !!skillDrafts[skill]
                    const loading = skillLoadingName === skill
                    return (
                      <button key={skill} onClick={() => handleSkillClick(skill)} disabled={loading}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${modified ? 'bg-vw-purple text-white border-vw-purple' : 'bg-white text-gray-700 border-gray-200 hover:border-vw-purple hover:text-vw-purple'}`}>
                        {loading ? <Spinner className="w-3 h-3" /> : <span>⚡</span>}
                        {skill.replace('.md', '')}
                        {modified && <span className="text-white/70 text-[10px]">edited</span>}
                      </button>
                    )
                  })}

                  {addingSkill !== null ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={addingSkill}
                        onChange={e => setAddingSkill(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const raw = addingSkill.trim()
                            if (!raw) { setAddingSkill(null); return }
                            const name = raw.endsWith('.md') ? raw : `${raw}.md`
                            setAddingSkill(null)
                            setSkillModal({ name, content: '' })
                          }
                          if (e.key === 'Escape') setAddingSkill(null)
                        }}
                        placeholder="skill-name"
                        className="px-2.5 py-1.5 text-xs border border-vw-purple/40 rounded-full focus:outline-none focus:ring-1 focus:ring-vw-purple/30 w-32 text-gray-700"
                      />
                      <span className="text-[10px] text-gray-400">↵ confirm</span>
                      <button onClick={() => setAddingSkill(null)} className="text-gray-400 hover:text-gray-600 text-xs leading-none">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingSkill('')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 border-dashed border-gray-300 text-gray-400 hover:border-vw-purple hover:text-vw-purple transition"
                    >
                      + Add Skill
                    </button>
                  )}
                </div>
              </div>

              {/* CTA bar */}
              {isDirty && (
                <div className="flex items-center justify-between p-4 bg-vw-purple-light border border-vw-purple/20 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-vw-purple">Unsaved changes</p>
                    <p className="text-xs text-vw-purple/70 mt-0.5">{hasPr ? 'Push to the open PR to trigger CI.' : 'Create a draft PR to start the CI pipeline.'}</p>
                  </div>
                  <button onClick={() => setShowPublishModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-vw-purple text-white text-sm font-semibold rounded-lg hover:bg-vw-purple-dark transition shadow-sm">
                    {hasPr ? 'Update PR' : 'Create draft PR'} →
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </main>

        {/* Right sidebar: Quality Checks */}
        {agentData && (
          <QualityChecksSidebar
            agentData={agentData}
            workflowRuns={workflowRuns}
            comments={comments}
            onApplyVerifyChanges={handleApplyVerifyChanges}
            applyLoading={applyLoading}
          />
        )}
        </>
        )}
      </div>

      {/* Modals */}
      {showPublishModal && activeTab === 'Create' && (
        <PublishModal
          agentName={newAgentName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
          hasPr={false}
          onClose={() => setShowPublishModal(false)}
          onConfirm={handleCreateAgent}
          loading={publishLoading}
        />
      )}
      {showPublishModal && activeTab !== 'Create' && agentData && (
        <PublishModal agentName={agentData.name} hasPr={hasPr} onClose={() => setShowPublishModal(false)}
          onConfirm={handlePublishConfirm} loading={publishLoading} />
      )}
      {skillModal && (activeTab === 'Create' || agentData) && (
        <SkillModal agentName={activeTab === 'Create' ? (newAgentName.trim() || 'new-agent') : agentData!.name} skillName={skillModal.name} content={skillModal.content}
          loading={false} onClose={() => setSkillModal(null)}
          onSave={content => {
            if (activeTab === 'Create') {
              setNewSkillDrafts(prev => ({ ...prev, [skillModal.name]: content }))
            } else {
              setSkillDrafts(prev => ({ ...prev, [skillModal.name]: content }))
            }
            setSkillModal(null)
          }} />
      )}
    </div>
  )
}
