import type { SessionCheckpoint, SessionDecision } from "../checkpoint/session.js";

const MS_PER_DAY = 86400000;

/** Half-life in days for recency decay: score multiplier exp(-ageDays / halfLife). */
export const BRIEF_DECAY_HALF_LIFE_DAYS = 14;

export function normalizeRepoPath(p: string): string {
  let s = p.replace(/\\/g, "/").trim().replace(/\/+/g, "/");
  if (s.startsWith("./")) {
    s = s.slice(2).replace(/\/+/g, "/");
  }
  return s;
}

/** Rough token estimate for budgeting (not a model tokenizer). */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

function parseCreatedMs(createdAt: string): number {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) ? t : 0;
}

export function overlapCount(filesTouched: string[], targetSet: Set<string>): number {
  let n = 0;
  for (const f of filesTouched) {
    const nrm = normalizeRepoPath(f);
    if (nrm.length > 0 && targetSet.has(nrm)) {
      n++;
    }
  }
  return n;
}

export function rankScore(overlap: number, createdAt: string, nowMs: number): number {
  if (overlap <= 0) return 0;
  const ageDays = Math.max(0, (nowMs - parseCreatedMs(createdAt)) / MS_PER_DAY);
  const decay = Math.exp(-ageDays / BRIEF_DECAY_HALF_LIFE_DAYS);
  return overlap * decay;
}

function formatDecisionBlock(cp: SessionCheckpoint, d: SessionDecision): string {
  return [`${cp.id} | ${d.id} | ${d.topic}`, `conclusion: ${d.conclusion}`, `rationale: ${d.rationale}`].join("\n");
}

export function assembleBrief(input: {
  targetPaths: string[];
  checkpoints: SessionCheckpoint[];
  nominalTokenBudget: number;
  nowMs: number;
  /** When provided, refines the empty-checkpoint message if sessions exist on shadow but none apply to HEAD. */
  shadowSessionCount?: number;
}): { body: string; stderrOverflow: string | null } {
  const targetSet = new Set(input.targetPaths.map(normalizeRepoPath).filter((p) => p.length > 0));

  if (input.checkpoints.length === 0) {
    if (input.shadowSessionCount !== undefined && input.shadowSessionCount > 0) {
      return {
        body:
          "No prior context for the current HEAD (no reachable session checkpoints for this commit; if you rebased or amended, run `quorum reconcile` or keep Quorum post-rewrite hooks enabled).\n",
        stderrOverflow: null,
      };
    }
    return { body: "No prior context in the shadow store yet.\n", stderrOverflow: null };
  }
  if (targetSet.size === 0) {
    return { body: "No prior context for the selected paths.\n", stderrOverflow: null };
  }

  const matching = input.checkpoints.filter((c) => overlapCount(c.files_touched, targetSet) > 0);
  if (matching.length === 0) {
    return { body: "No prior context for the selected paths.\n", stderrOverflow: null };
  }

  const scored = matching
    .map((cp) => ({
      cp,
      score: rankScore(overlapCount(cp.files_touched, targetSet), cp.created_at, input.nowMs),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.cp.created_at.localeCompare(a.cp.created_at);
    });

  const orderedCps = scored.map((s) => s.cp);

  const canonBlocks: string[] = [];
  const seenCanonIds = new Set<string>();
  for (const cp of orderedCps) {
    for (const d of cp.decisions) {
      if (!d.canonical) continue;
      if (seenCanonIds.has(d.id)) continue;
      seenCanonIds.add(d.id);
      canonBlocks.push(formatDecisionBlock(cp, d));
    }
  }

  const canonicalText =
    canonBlocks.length > 0 ? `[canonical]\n\n${canonBlocks.join("\n\n")}\n\n` : "";
  const canonicalSectionTokens = estimateTokens(canonicalText);
  let stderrOverflow: string | null = null;
  if (canonicalSectionTokens > input.nominalTokenBudget) {
    stderrOverflow =
      "quorum brief: canonical (pinned) decisions exceed the nominal token budget; emitting them in full.\n";
  }

  const contextBlocks: string[] = [];
  let contextTokensUsed = 0;
  const seenCtxIds = new Set<string>();
  outer: for (const cp of orderedCps) {
    for (const d of cp.decisions) {
      if (d.canonical) continue;
      if (seenCtxIds.has(d.id)) continue;
      const block = formatDecisionBlock(cp, d);
      const blockTokens = estimateTokens(block);
      if (contextTokensUsed + blockTokens > input.nominalTokenBudget) {
        break outer;
      }
      seenCtxIds.add(d.id);
      contextBlocks.push(block);
      contextTokensUsed += blockTokens;
    }
  }

  const contextText =
    contextBlocks.length > 0 ? `[context]\n\n${contextBlocks.join("\n\n")}\n\n` : "";

  const oq: string[] = [];
  const seenOq = new Set<string>();
  for (const cp of orderedCps) {
    for (const q of cp.open_questions) {
      const qq = q.trim();
      if (!qq || seenOq.has(qq)) continue;
      seenOq.add(qq);
      oq.push(qq);
    }
  }
  const oqText = oq.length > 0 ? `[open_questions]\n\n${oq.map((q) => `- ${q}`).join("\n")}\n\n` : "";

  if (canonBlocks.length === 0 && contextBlocks.length === 0 && oq.length === 0) {
    return { body: "No extracted decisions or open questions for this selection.\n", stderrOverflow: null };
  }

  const body = `${canonicalText}${contextText}${oqText}`.replace(/\n+$/, "") + "\n";
  return { body, stderrOverflow };
}
