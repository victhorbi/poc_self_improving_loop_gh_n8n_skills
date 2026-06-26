# n8n Skills — Akinator Agent

This repo powers a skills-based Akinator AI agent for n8n. The agent has no hardcoded game logic — it reads its instructions from skill files at runtime, exactly like Claude Code skills.

## Repository Structure

```
├── skills/                        # Skill files loaded by the agent at runtime
│   ├── candidate-state-manager.md
│   ├── entropy-calculator.md
│   ├── confidence-threshold-check.md
│   └── knowledge-base-resolver.md
├── agents/
│   └── akinator/
│       ├── system-prompt.md       # Live system prompt (may include quality header)
│       └── evals/
│           └── eval-set.json      # Auto-generated test cases
└── workflows/                     # Importable n8n workflow JSON files
    ├── akinator-game.json          # Main chat agent
    ├── edit-system-prompt-pr.json  # Edit prompt + open PR
    ├── generate-eval-set.json      # Generate evaluation test cases
    ├── run-single-eval.json        # Run one game simulation
    └── evaluate-pr.json           # Quality gate for open PRs
```

See [workflows/README.md](workflows/README.md) for full workflow documentation.

## Skills

| Skill | Role | Trigger |
|-------|------|---------|
| [Candidate State Manager](skills/candidate-state-manager.md) | The "Brain" | Every user answer |
| [Entropy Calculator](skills/entropy-calculator.md) | The "Strategist" | Pool > 3 candidates |
| [Confidence Threshold Check](skills/confidence-threshold-check.md) | The "Judge" | Pool ≤ 3 or P > 0.90 |
| [Knowledge Base Resolver](skills/knowledge-base-resolver.md) | The "Deep Researcher" | 0 candidates remaining |

## Skill File Format

Each skill follows this structure:

```
## 00 One-line summary
## 01 When To Use The Skill
## 02 How Your Agent Does It
## 03 Output Structure
## 04 Real World Example/s
## 05 What To Avoid
```

## Required n8n Setup

| Item | Where | Value |
|------|-------|-------|
| GitHub credential | n8n Credentials | Personal access token with `repo` scope |
| OpenRouter credential | n8n Credentials | API key from openrouter.ai |
| `OPENROUTER_API_KEY` env var | n8n Settings → Variables | Same key as above — used by eval Code nodes |
| `EVAL_MODEL` env var (optional) | n8n Settings → Variables | Defaults to `google/gemini-2.5-flash-preview` |
