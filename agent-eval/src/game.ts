import type { Config, EvalCase, GameResult } from "./types.js";
import { callAgent } from "./agent.js";
import { callUser } from "./user.js";

/** Matches the original n8n exit signal from the simulated user. */
const SUCCESS_REGEX = /succeed|success|satisfied/i;

/**
 * Detects agent responses that indicate skill file access failure.
 * When matched the game is immediately marked as failed — the simulated user
 * must not be consulted, because the agent has not functioned correctly
 * regardless of whether the user might have been fooled into saying "succeed".
 *
 * Patterns covered:
 *  - Agent tried to fetch/load skills but got an error or "not found"
 *  - Agent is asking the user to verify/provide skill file paths
 *  - Agent explicitly says it cannot proceed because of missing skills
 */
const SKILL_ERROR_PATTERNS: RegExp[] = [
  // fetch / load / access skill file(s) — then an error indicator
  /\b(fetch|load|access|retrieve|find|get)\b.{0,120}\bskill\s+files?\b.{0,120}\b(error|fail|not found|could not|unable|missing|unavailable|encounter)/is,
  // skill file/path not found (order flipped)
  /\bskill\s+files?\b.{0,120}\b(not found|could not be found|unable|missing|unavailable|error|fail|encounter)/is,
  // agent asks user to verify / provide skill paths
  /\bverify\b.{0,60}\b(paths?|locations?)\b.{0,60}\b(skill|files?)\b/i,
  /\bprovide\b.{0,60}\b(correct|right|actual)\b.{0,60}\b(paths?|locations?)\b/i,
  // cannot proceed due to skills
  /\b(cannot|can't|unable to)\b.{0,80}\bproceed\b.{0,80}\bskill\b/i,
];

/**
 * Returns a short excerpt from `text` if it matches any SKILL_ERROR_PATTERN,
 * or null if no match. The excerpt is used as the `skillError` field on GameResult.
 */
function detectSkillError(text: string): string | null {
  for (const re of SKILL_ERROR_PATTERNS) {
    const m = text.match(re);
    if (m) return text.slice(Math.max(0, m.index! - 20), m.index! + m[0].length + 40).trim();
  }
  return null;
}

/**
 * Run one eval case to completion.
 *
 * Turn order per iteration (mirrors n8n "1 - Run Eval"):
 *   1. agent under test responds to the current message
 *   2. simulated user replies
 *   3. if the user signals success -> game won; if iteration budget is exhausted -> game lost
 *
 * Difference from the n8n version: success is tied to the user actually signalling
 * satisfaction, not merely to `iterations < max`. This fixes the corner case where the
 * user said "succeed" exactly on the final allowed iteration and was wrongly scored a loss.
 */
export async function runGame(
  cfg: Config,
  evalCase: EvalCase,
  runId: string,
): Promise<GameResult> {
  const sessionId = `${runId}:${evalCase.id}`;
  const transcript: GameResult["transcript"] = [];
  const userHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  let chatInput = evalCase.chatMessage;
  let iterations = 0;
  let success = false;
  let tokensUsed = 0;

  while (true) {
    const agentText = await callAgent(cfg, {
      chatInput,
      sessionId,
      branch: cfg.branch,
      owner: cfg.owner,
      repo: cfg.repo,
      agentFolder: cfg.agentFolder,
    });
    transcript.push({ role: "agent", text: agentText });

    // Guard: if the agent reported a skill access failure, fail immediately.
    // The simulated user must not be consulted — the agent hasn't functioned correctly.
    const skillFailExcerpt = detectSkillError(agentText);
    if (skillFailExcerpt !== null) {
      console.warn(`game ${evalCase.id}: skill error detected — failing without user turn.\n  Excerpt: "${skillFailExcerpt}"`);
      iterations++;
      return {
        id: evalCase.id,
        iterations,
        success: false,
        tokens_used: tokensUsed,
        skillError: skillFailExcerpt,
        transcript,
      };
    }

    const userTurn = await callUser(cfg, {
      context: evalCase.context,
      thoughts: evalCase.thoughts,
      agentMessage: agentText,
      history: userHistory,
    });
    transcript.push({ role: "user", text: userTurn.text });
    tokensUsed += userTurn.usage.total_tokens;

    iterations++;

    const satisfied = SUCCESS_REGEX.test(userTurn.text);
    if (satisfied || iterations >= cfg.maxIterations) {
      success = satisfied;
      break;
    }

    chatInput = userTurn.text;
  }

  return { id: evalCase.id, iterations, success, tokens_used: tokensUsed, transcript };
}

/** HTTP status codes worth retrying once — Cloudflare 52x, gateway 502/503. */
const RETRIABLE_STATUS = /\b5(?:2[0-9]|0[23])\b/;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Run an array of games with a bounded concurrency (default 1 = sequential). */
export async function runGames(
  cfg: Config,
  cases: EvalCase[],
  runId: string,
): Promise<GameResult[]> {
  const results: GameResult[] = new Array(cases.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < cases.length) {
      const i = cursor++;
      const c = cases[i];
      let lastErr = "";
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          if (attempt > 0) {
            await sleep(12_000);
            console.warn(`game ${c.id}: retrying after gateway timeout…`);
          }
          const effectiveRunId = attempt > 0 ? `${runId}-r${attempt}` : runId;
          results[i] = await runGame(cfg, c, effectiveRunId);
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
          if (attempt === 0 && RETRIABLE_STATUS.test(lastErr)) continue;
          console.error(`game ${c.id} errored: ${lastErr}`);
          results[i] = {
            id: c.id,
            iterations: cfg.maxIterations,
            success: false,
            tokens_used: 0,
            error: lastErr,
            transcript: [{ role: "user", text: `ERROR: ${lastErr}` }],
          };
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(cfg.concurrency, cases.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
