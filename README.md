# n8n Skills

A collection of AI agent skills for n8n workflows.

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
