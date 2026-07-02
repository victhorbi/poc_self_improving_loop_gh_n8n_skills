// Static formal verification for agent system prompts and skill files.
// Each file is checked against six named properties (P1–P6):
//   P1–P2: deterministic regex checks  (no LLM required)
//   P3–P6: LLM-based semantic checks   (via OpenRouter)
// FAIL results exit non-zero; WARN results are reported but do not block.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parsePrompt } from "./eval.js";

interface VerificationResult {
  rule: string;
  name: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
}

interface FileReport {
  filePath: string;
  displayPath: string;
  results: VerificationResult[];
  error?: string;
}

// ── Static checks ─────────────────────────────────────────────────────────────

function checkNoCredentials(content: string): VerificationResult {
  const patterns = [
    /\bapi[-_]?key\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/i,
    /\bbearer\s+[A-Za-z0-9_\-\.]{20,}/i,
    /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE KEY/,
    /\bsk-[A-Za-z0-9]{20,}\b/,
    /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/,
  ];
  if (patterns.some(p => p.test(content))) {
    return {
      rule: "P1", name: "NO_CREDENTIALS", status: "FAIL",
      message: "Potential credential or API key pattern detected — never embed secrets in prompt files.",
    };
  }
  return { rule: "P1", name: "NO_CREDENTIALS", status: "PASS", message: "No credential patterns detected." };
}

function checkNoSelfDisclosure(content: string): VerificationResult {
  const patterns = [
    /share (these|this|your|my) (instructions|prompt|rules)/i,
    /reveal (your|the|this) (system )?prompt/i,
    /print (your|the|these) (instructions|prompt)/i,
    /repeat (your|the|these) (instructions|system prompt|rules)/i,
    /output (your|the|these) (full |complete |entire )?(instructions|system prompt)/i,
  ];
  if (patterns.some(p => p.test(content))) {
    return {
      rule: "P2", name: "NO_SELF_DISCLOSURE", status: "FAIL",
      message: "Instructions appear to direct the agent to reveal its own system prompt.",
    };
  }
  return {
    rule: "P2", name: "NO_SELF_DISCLOSURE", status: "PASS",
    message: "No prompt self-disclosure instructions detected.",
  };
}

// ── LLM-based checks ──────────────────────────────────────────────────────────

const LLM_PROMPT = (fileType: string, content: string) =>
  `You are a formal verifier for AI agent configuration files. Analyse the following ${fileType} and evaluate it against these properties. Be strict but fair.

FILE CONTENT:
\`\`\`
${content}
\`\`\`

Evaluate each property. Return ONLY a valid JSON array — no markdown fences, no explanation.
Each object must have exactly: rule (string), name (string), status ("PASS"|"WARN"|"FAIL"), message (one sentence).

P3 ROLE_CLARITY: The agent's role, purpose, and intended audience are clearly and unambiguously defined.
PASS=specific and unambiguous; WARN=vague or open to multiple interpretations; FAIL=missing or contradictory.

P4 BEHAVIORAL_BOUNDARIES: The file explicitly states what the agent should NOT do or what is off-limits.
PASS=at least one explicit constraint or refusal defined; WARN=only implicit limits present; FAIL=no constraints at all.

P5 INTERNAL_CONSISTENCY: All instructions are coherent with no direct contradictions.
PASS=no contradictions; WARN=minor tension that could cause inconsistent behaviour; FAIL=direct contradictions.

P6 SAFETY_GUARDRAILS: No instructions direct the agent toward harmful, deceptive, or manipulative outputs.
PASS=guardrails present or no harmful patterns; WARN=ambiguous phrasing plausibly misusable; FAIL=explicitly enables harm.`;

async function runLLMChecks(
  content: string,
  fileType: string,
  apiKey: string,
  model: string,
): Promise<VerificationResult[]> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/agent-eval",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: "user", content: LLM_PROMPT(fileType, content) }],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error(`No JSON array in LLM response: ${raw.slice(0, 200)}`);
  return JSON.parse(raw.slice(start, end + 1)) as VerificationResult[];
}

// ── Report formatting ─────────────────────────────────────────────────────────

function buildReport(reports: FileReport[]): string {
  const icon = (s: string) => (s === "PASS" ? "✅" : s === "WARN" ? "⚠️" : "❌");

  const sections = reports.map(({ displayPath, results, error }) => {
    if (error) return `### \`${displayPath}\`\n\n> ❌ Verification error: ${error}`;

    const rows = results
      .map(r => `| \`${r.rule}\` | ${r.name} | ${icon(r.status)} ${r.status} | ${r.message} |`)
      .join("\n");

    const fails = results.filter(r => r.status === "FAIL");
    const warns = results.filter(r => r.status === "WARN");
    const verdict =
      fails.length > 0
        ? `❌ **FAILED** (${fails.length} critical issue${fails.length > 1 ? "s" : ""})`
        : warns.length > 0
        ? `⚠️ **PASSED with warnings** (${warns.length})`
        : "✅ **PASSED**";

    return [
      `### \`${displayPath}\``,
      "",
      "| Rule | Property | Status | Finding |",
      "|------|----------|--------|---------|",
      rows,
      "",
      verdict,
    ].join("\n");
  });

  const totalFails = reports.reduce(
    (n, r) => n + (r.error ? 1 : r.results.filter(v => v.status === "FAIL").length),
    0,
  );
  const summary =
    totalFails > 0
      ? `❌ **${totalFails} critical issue${totalFails > 1 ? "s" : ""} — resolve before merging**`
      : "✅ All files passed static verification";

  return ["## 🔍 Static Verification Report", "", summary, "", ...sections].join("\n");
}

async function postComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`Failed to post PR comment: ${res.status} ${await res.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const filePaths = process.argv.slice(2);
  if (filePaths.length === 0) {
    console.error("Usage: tsx src/verify.ts <file1> [file2 ...]");
    process.exit(1);
  }

  const token    = process.env.GITHUB_TOKEN ?? "";
  const apiKey   = process.env.OPENROUTER_API_KEY ?? "";
  const owner    = process.env.OWNER ?? "";
  const repo     = process.env.REPO ?? "";
  const prNumber = process.env.PR_NUMBER ? parseInt(process.env.PR_NUMBER, 10) : null;
  const model    = process.env.VERIFY_MODEL ?? "openai/gpt-4.1-mini";

  if (!apiKey) { console.error("OPENROUTER_API_KEY is not set"); process.exit(1); }

  const reports: FileReport[] = [];

  for (const filePath of filePaths) {
    const displayPath = filePath.replace(/^\.\.[/\\]/, "");
    console.log(`Verifying ${displayPath}…`);
    try {
      const raw = await readFile(filePath, "utf8");
      const isSystemPrompt = basename(filePath) === "system-prompt.md";
      const content  = isSystemPrompt ? parsePrompt(raw).cleanPrompt : raw;
      const fileType = isSystemPrompt ? "system prompt" : "skill file";

      const staticResults = [checkNoCredentials(content), checkNoSelfDisclosure(content)];
      const llmResults    = await runLLMChecks(content, fileType, apiKey, model);

      reports.push({ filePath, displayPath, results: [...staticResults, ...llmResults] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error verifying ${displayPath}: ${msg}`);
      reports.push({ filePath, displayPath, results: [], error: msg });
    }
  }

  const report = buildReport(reports);
  console.log("\n" + report);

  if (token && owner && repo && prNumber !== null) {
    try {
      await postComment(token, owner, repo, prNumber, report);
      console.log("✓ Posted PR comment.");
    } catch (e) {
      console.error("Failed to post PR comment:", e instanceof Error ? e.message : e);
    }
  }

  const hasCritical = reports.some(r => r.error || r.results.some(v => v.status === "FAIL"));
  if (hasCritical) process.exit(1);
}

main().catch(err => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
