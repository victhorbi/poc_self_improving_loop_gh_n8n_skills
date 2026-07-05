# Agent Self-Improvement System

A framework for building AI conversational agents that evaluate, verify, and improve themselves automatically. You write the initial agent definition; the system handles provisioning, evaluation, static safety verification, scoring, and — over time — proposes its own improvements.

Includes a web UI (**AgentForge**) for managing agents, reviewing quality checks, and previewing live chat — with no manual n8n interaction required for day-to-day use.

Three agents ship as reference implementations: **Akinator** (character-guessing game), **Novagirl**, and **B3mo**. The framework is agent-agnostic: add any agent under `agents/` and the full pipeline activates automatically.

---

## How It Works

```
Developer writes system-prompt.md (+ optional skill files)
         │
         ▼
CI provisions n8n workflow + sets webhook secret (once per new agent)
         │
         ▼
CI generates eval-set.json (once per new agent, force-regeneratable)
         │
         ▼
Open PR  ◄──────────────────────────────────────────────────────────┐
         │                                                           │
         ▼                                                           │
GitHub Actions: static verification (P1–P13, assessment only)       │
  • Checks for credentials, injection payloads, role clarity,       │
    EU AI Act Art. 50 disclosure, injection resilience, and more    │
  • Reports findings in PR comment — never blocks merge             │
         │                                                           │
         ▼                                                           │
GitHub Actions: eval harness                                         │
  • Fetches eval set + system prompt from the PR branch             │
  • Runs N games in parallel (agent + user simulator)               │
  • Computes: success rate, avg turns, tokens/game                  │
  • Commits QUALITY_SCORE header to system-prompt.md               │
  • If quality improved → marks PR ready for review                 │
         │                                                           │
         ▼                                                           │
Developer reviews + merges PR (via AgentForge or GitHub)            │
         │                                                           │
         ▼                                                           │
Stale logs are deleted automatically (clean-eval-logs)              │
         │                                                           │
         ▼                                                           │
After N merged PRs: analyze-and-improve fires automatically          │
  • Reads current agent files + last N conversation logs            │
  • LLM identifies failure patterns by priority (see below)         │
  • LLM applies targeted edits to system-prompt + skills            │
  • Opens a draft PR with the improvements ──────────────────────────┘
```

---

## Repository Structure

```
├── agents/
│   ├── akinator/
│   │   ├── system-prompt.md          # Agent definition (includes QUALITY_SCORE header after first eval)
│   │   ├── skills/                   # Per-agent skill files (loaded by the agent at runtime)
│   │   │   ├── candidate-state-manager.md
│   │   │   ├── entropy-calculator.md
│   │   │   ├── confidence-threshold-check.md
│   │   │   └── knowledge-base-resolver.md
│   │   └── evals/
│   │       ├── eval-set.json         # Test scenarios (auto-generated, committed to repo)
│   │       └── logs/                 # Conversation logs per eval run (auto-generated)
│   │           └── 2026-01-15T14-30-00-42-manual.json
│   ├── novagirl/
│   │   ├── system-prompt.md
│   │   └── evals/
│   │       └── eval-set.json
│   └── b3mo/
│       └── system-prompt.md
│
├── agent-eval/                       # TypeScript eval + verification harness (GitHub Actions)
│   └── src/
│       ├── eval.ts                   # Orchestrates a full eval run
│       ├── game.ts                   # Single game loop (agent + user simulator)
│       ├── generate.ts               # Eval set generation (supports force-regeneration)
│       ├── generate-index.ts         # CLI entry for generate-eval-set workflow
│       ├── verify.ts                 # Static verification (P1–P13)
│       ├── github.ts                 # GitHub Contents API helpers
│       └── types.ts                  # Shared interfaces
│
├── webapp/                           # AgentForge — Next.js web UI
│   └── app/api/agents/[name]/
│       ├── route.ts                  # Agent data (prompt, skills, PR info); ?ref= supported
│       ├── chat/route.ts             # Proxy to n8n webhook for live preview chat
│       ├── eval-set/route.ts         # Eval set presence + count
│       ├── logs/route.ts             # Eval log listing and content
│       ├── skill/route.ts            # Individual skill file read/write
│       ├── improve-from-chat/route.ts # LLM-driven prompt improvement from chat history
│       └── webhook-status/route.ts  # Check if agent's n8n webhook is configured
│
├── workflows/                        # Importable n8n workflow JSON files
│   ├── akinator-game.json            # Live Akinator chat agent
│   ├── analyze-and-improve.json      # Analyze logs + open improvement PR
│   ├── edit-system-prompt-pr.json    # AI-edit a prompt and open a draft PR
│   ├── generate-eval-set.json        # Generate test cases (n8n version)
│   ├── run-single-eval.json          # Run one game interactively
│   └── evaluate-pr.json             # Quality gate (legacy n8n path)
│
└── .github/
    └── workflows/
        ├── agent-eval.yml            # Run eval on every PR touching agents/
        ├── generate-eval-set.yml     # Auto-generate eval set; force-regenerate on manual dispatch
        ├── verify-prompt.yml         # Static P1–P13 verification (assessment, non-blocking)
        ├── provision-n8n-agent.yml   # Provision n8n workflow + webhook secret for new agents
        ├── clean-eval-logs.yml       # Delete stale logs after a prompt/skills merge
        └── auto-analyze.yml         # Trigger analyze-and-improve after N sessions
```

---

## AgentForge Web UI

`webapp/` is a Next.js 14 app that provides a UI for the entire pipeline.

**Configure tab** — Edit system prompt and skills, open or update a PR, view the auto-remediated diff from the last verification run.

**Quality Checks sidebar** — Four collapsible sections:

| Section | What it shows |
|---|---|
| **Formal Verification** | P1–P13 results from the last `verify-prompt` run; shows auto-remediation diff when available |
| **Simulated Users** | Eval set status (✅ N · Simulated users available); controls number of cases to generate |
| **Chat Logs** | Eval run logs with per-game conversation replay; configurable success rate and iteration thresholds |
| **Analyse & Improve** | Manual or automatic improvement mode |

Each section has a **▶ Run** button that dispatches the corresponding GitHub Actions workflow directly from the UI.

**Preview tab** — Live chat with the agent via its n8n webhook. Includes an "✨ Use this chat to improve" button that sends the conversation to an LLM and proposes prompt edits.

**Left sidebar** — Agent list with traffic-light status, plus a live Workflows panel showing recent GitHub Actions runs.

---

## Adding a New Agent

1. Create `agents/<your-agent>/system-prompt.md` with your agent definition.
2. Open a PR — three things happen automatically:
   - `provision-n8n-agent` creates an n8n chat workflow, activates it, and stores the webhook URL as a repo variable (`N8N_AGENT_<NAME>_WEBHOOK_URL`).
   - `generate-eval-set` generates `evals/eval-set.json` and commits it to the branch.
   - `verify-prompt` runs the P1–P13 static checks and posts findings as a PR comment.
3. Once the eval set is committed, `agent-eval` runs, scores the agent, and writes the `QUALITY_SCORE` header.
4. Review and merge. The improvement loop is now active for your agent.

**Per-agent skill files** live under `agents/<name>/skills/*.md` and are automatically included in verification and eval runs.

---

## Re-provisioning an Agent

If an agent's n8n workflow was deleted or deactivated after initial provisioning:

1. Go to **Actions → Provision n8n Agent Workflow → Run workflow**.
2. Enter the agent name (e.g. `novagirl`) and set **force** to `true`.
3. This re-creates the workflow in n8n, re-activates it, and updates the `N8N_AGENT_<NAME>_WEBHOOK_URL` variable.

---

## Regenerating an Eval Set

When you want more (or fewer) simulated users than the existing set:

1. Open AgentForge → select the agent → Simulated Users section.
2. Change **Number of simulated users** and click **▶ Run**.
3. Because it's a manual dispatch, `FORCE_REGEN=true` is set automatically — the workflow overwrites the existing `eval-set.json` instead of skipping.

---

## Static Verification (P1–P13)

Every PR that touches a system prompt or skill file triggers `verify-prompt.yml`. The verifier checks 13 named properties:

| ID | Property | Method |
|---|---|---|
| P1 | NO_CREDENTIALS | Static regex |
| P2 | NO_SELF_DISCLOSURE | Static regex |
| P7 | NO_INJECTION_PAYLOAD | Static regex |
| P3 | ROLE_CLARITY | LLM |
| P4 | BEHAVIORAL_BOUNDARIES | LLM |
| P5 | INTERNAL_CONSISTENCY | LLM |
| P6 | SAFETY_GUARDRAILS | LLM |
| P8 | INJECTION_RESILIENCE | LLM |
| P9 | NO_EXFILTRATION | LLM |
| P10 | TOOL_CALL_SAFETY | LLM |
| P11 | IP_PROTECTION | LLM |
| P12 | EU_AI_ACT_ART50 | LLM |
| P13 | LIABILITY_PROTECTION | LLM |

Results are posted as a PR comment. **FAIL and WARN findings are informational — they never block a merge.** The workflow always completes successfully so CI stays green. When FAILs or WARNs are found, an auto-remediation commit is proposed on the PR branch (`[skip-verify]` tag prevents re-triggering).

---

## Improvement Priority

When `analyze-and-improve` runs, it inspects conversation logs and proposes fixes in this order:

| Priority | Area | What triggers it |
|---|---|---|
| **1 — Critical** | Credentials or secrets exposed | Any API key, password, or token in agent output — including chain-of-thought |
| **1 — Critical** | System prompt or skill file leaked | Agent quotes or paraphrases its own instructions |
| **1 — Critical** | User hidden context exposed | Agent reveals `context` or `thoughts` fields (never sent by the user) |
| **1 — Critical** | Raw tool output surfaced | Agent forwards API payloads or raw JSON to the user |
| **2 — High** | Process exposed | Agent describes its own algorithm or internal reasoning |
| **2 — High** | Rule breaking | Agent violates its own stated rules |
| **3 — Medium** | Success rate | Notable fraction of sessions fail to complete |
| **4 — Low** | Turn count | Significantly more questions than median to reach a conclusion |
| **5 — Last** | Token efficiency | Unnecessarily verbose or repetitive responses |

---

## GitHub Actions Workflows

### `verify-prompt.yml` — Static verification on every PR

**Triggers:** PR touching `agents/*/system-prompt.md` or `agents/*/skills/**/*.md`; manual dispatch.

**Manual dispatch inputs:** `agent` (e.g. `novagirl`), `ref` (branch or SHA, defaults to `main`).

Posts a detailed P1–P13 report as a PR comment. Auto-commits a remediation patch when issues are found. Always exits successfully — findings are advisory only.

---

### `provision-n8n-agent.yml` — Provision n8n for new agents

**Triggers:** PR that adds a new `agents/*/system-prompt.md`; manual dispatch.

**Manual dispatch inputs:** `agent_name` (required), `force` (`true` to re-provision an existing agent).

For each new agent: creates a chat-trigger n8n workflow, activates it, and sets `N8N_AGENT_<NAME>_WEBHOOK_URL` as a repo variable. Idempotent — skips agents already provisioned unless `force=true`.

**Required secrets:**

| Secret | Description |
|---|---|
| `N8N_API_URL` | n8n instance base URL |
| `N8N_API_KEY` | n8n API key (Settings → n8n API) |

---

### `agent-eval.yml` — Eval on every PR

**Triggers:** PR touching `agents/**`; manual dispatch.

**Manual dispatch inputs:** `agent_name`, plus optional `min_success_rate`, `max_avg_iterations`, `concurrency`.

Reads the agent-specific webhook URL from repo variables (`N8N_AGENT_<NAME>_WEBHOOK_URL`). If not set, prints the exact variable name to add and exits cleanly.

---

### `generate-eval-set.yml` — Generate eval set

**Triggers:** PR that adds a new `agents/*/system-prompt.md`; manual dispatch.

**Manual dispatch inputs:** `agent_name` (required), `num_tests` (default `10`).

Manual dispatch always force-regenerates (`FORCE_REGEN=true`), overwriting any existing `eval-set.json`. PR-triggered runs are idempotent (skip if file already exists).

**Required secrets:**

| Secret | Description |
|---|---|
| `OPENROUTER_API_KEY` | Used to call the LLM that generates test cases |
| `EVAL_GEN_MODEL` _(optional)_ | OpenRouter model slug. Default: `openai/gpt-5.4-mini` |

---

### `clean-eval-logs.yml` — Delete stale logs after a merge

**Triggers:** Push to `main` touching `agents/**/system-prompt.md` or `agents/**/skills/**`.

Deletes all files under `agents/<affected>/evals/logs/` for every agent whose prompt or skills changed. Resets the session counter so `auto-analyze` fires fresh after the next N runs.

---

### `auto-analyze.yml` — Trigger analysis after N sessions

**Triggers:** Push to `main` touching `agents/*/evals/logs/*.json`.

Counts log files per agent. When the count crosses the threshold (default: 5), calls the `analyze-and-improve` n8n webhook for that agent. Fires only on the crossing — not on every subsequent push. Counter resets when `clean-eval-logs` runs after a merge.

**Required secrets / variables:**

| Name | Type | Description |
|---|---|---|
| `N8N_ANALYZE_WEBHOOK_URL` | Secret | Production webhook URL from the `analyze-and-improve` n8n workflow |
| `ANALYZE_SESSIONS_THRESHOLD` | Variable | Minimum sessions before triggering analysis. Default: `5` |

---

## QUALITY_SCORE Header

Every eval run prepends a structured comment to `system-prompt.md`:

```markdown
<!-- QUALITY_SCORE
{
  "model": "deepseek/deepseek-v4-flash",
  "total_games": 10,
  "valid_games": 9,
  "errored_games": 1,
  "successful_games": 7,
  "success_rate": 77.8,
  "avg_iterations": 14.2,
  "total_tokens": 48300,
  "tokens_per_game": 5367,
  "evaluated_at": "2026-01-15T14:30:00.000Z",
  "first_run": false,
  "thresholds_used": null
}
-->
```

The harness strips this header before sending the prompt to the agent. A PR is marked ready for review when both `success_rate` and `avg_iterations` strictly improve over the baseline.

---

## Required Setup

### GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Required | Description |
|---|---|---|
| `N8N_API_URL` | Yes | n8n instance base URL (for provisioning) |
| `N8N_API_KEY` | Yes | n8n API key (for provisioning) |
| `OPENROUTER_API_KEY` | Yes | API key from openrouter.ai |
| `N8N_ANALYZE_WEBHOOK_URL` | Yes | Webhook URL from `analyze-and-improve.json` |
| `EVAL_GEN_MODEL` | No | OpenRouter model for eval generation. Default: `openai/gpt-5.4-mini` |

### GitHub Variables (Settings → Secrets and variables → Actions → Variables)

| Variable | Default | Description |
|---|---|---|
| `ANALYZE_SESSIONS_THRESHOLD` | `5` | Sessions before auto-analysis fires |
| `N8N_AGENT_<NAME>_WEBHOOK_URL` | Set by provision workflow | Per-agent n8n webhook URL (auto-set on new agent PRs) |
| `N8N_AGENT_SKILLS_WORKFLOW_ID` | `3cqVVop36Bx3ySMa` | ID of the generic skills n8n workflow used as the agent template |

### AgentForge Local Setup

```bash
cd webapp
cp .env.local.example .env.local   # fill in GITHUB_TOKEN, OPENROUTER_API_KEY, etc.
npm install
npm run dev
```

### n8n Credentials

| Credential | Used by | Notes |
|---|---|---|
| GitHub (Personal Access Token, `repo` scope) | All HTTP request nodes | Read + write access to this repo |
| OpenRouter API key | All LLM nodes | Same key as `OPENROUTER_API_KEY` secret |
