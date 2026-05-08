import { describe, expect, it } from "vitest";
import type { SessionCheckpoint } from "../src/checkpoint/session.js";
import {
  assembleBrief,
  estimateTokens,
  normalizeRepoPath,
  overlapCount,
  rankScore,
} from "../src/brief/assemble.js";

const SHA = "a".repeat(40);

function sessionCheckpoint(partial: Partial<SessionCheckpoint> & Pick<SessionCheckpoint, "id" | "created_at">): SessionCheckpoint {
  return {
    kind: "session",
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    agent: "claude-code",
    commit_sha: SHA,
    intent: "test",
    branch: null,
    pr_number: null,
    decisions: [],
    files_touched: [],
    open_questions: [],
    ...partial,
  };
}

describe("assembleBrief", () => {
  const frozenNow = Date.parse("2026-06-01T12:00:00.000Z");

  it("orders context by higher file overlap first (same recency window)", () => {
    const narrow = sessionCheckpoint({
      id: "narrow",
      created_at: "2026-05-15T12:00:00.000Z",
      files_touched: ["lib/a.ts"],
      decisions: [
        {
          id: "dn",
          topic: "Narrow",
          conclusion: "n",
          rationale: "r",
          canonical: false,
        },
      ],
    });
    const wide = sessionCheckpoint({
      id: "wide",
      created_at: "2026-05-15T12:00:00.000Z",
      files_touched: ["lib/a.ts", "lib/b.ts"],
      decisions: [
        {
          id: "dw",
          topic: "Wide",
          conclusion: "w",
          rationale: "r",
          canonical: false,
        },
      ],
    });
    const { body } = assembleBrief({
      targetPaths: ["lib/a.ts", "lib/b.ts"],
      checkpoints: [narrow, wide],
      nominalTokenBudget: 10_000,
      nowMs: frozenNow,
    });
    const ctx = body.slice(body.indexOf("[context]"));
    expect(ctx.indexOf("wide")).toBeLessThan(ctx.indexOf("narrow"));
  });

  it("orders context by recency when overlap is equal", () => {
    const older = sessionCheckpoint({
      id: "older",
      created_at: "2026-01-01T12:00:00.000Z",
      files_touched: ["src/x.ts"],
      decisions: [
        { id: "o1", topic: "Old", conclusion: "o", rationale: "r", canonical: false },
      ],
    });
    const newer = sessionCheckpoint({
      id: "newer",
      created_at: "2026-05-28T12:00:00.000Z",
      files_touched: ["src/x.ts"],
      decisions: [
        { id: "n1", topic: "New", conclusion: "n", rationale: "r", canonical: false },
      ],
    });
    const { body } = assembleBrief({
      targetPaths: ["src/x.ts"],
      checkpoints: [older, newer],
      nominalTokenBudget: 10_000,
      nowMs: frozenNow,
    });
    const ctx = body.slice(body.indexOf("[context]"));
    expect(ctx.indexOf("newer")).toBeLessThan(ctx.indexOf("older"));
  });

  it("emits stderr overflow when canonical pinned block exceeds nominal token budget", () => {
    const rationale = "x".repeat(400);
    const pinned = sessionCheckpoint({
      id: "pin-cp",
      created_at: "2026-05-10T12:00:00.000Z",
      files_touched: ["README.md"],
      decisions: [
        {
          id: "p1",
          topic: "Pinned",
          conclusion: "yes",
          rationale,
          canonical: true,
        },
      ],
    });
    const { stderrOverflow } = assembleBrief({
      targetPaths: ["README.md"],
      checkpoints: [pinned],
      nominalTokenBudget: 20,
      nowMs: frozenNow,
    });
    expect(stderrOverflow).toContain("canonical (pinned)");
    expect(stderrOverflow).toContain("nominal token budget");
  });

  it("returns empty-store message when no checkpoints", () => {
    const { body } = assembleBrief({
      targetPaths: ["a.ts"],
      checkpoints: [],
      nominalTokenBudget: 1000,
      nowMs: frozenNow,
    });
    expect(body).toBe("No prior context in the shadow store yet.\n");
  });

  it("returns no-paths message when target set is empty", () => {
    const { body } = assembleBrief({
      targetPaths: [],
      checkpoints: [
        sessionCheckpoint({
          id: "x",
          created_at: "2026-05-10T12:00:00.000Z",
          files_touched: ["a.ts"],
          decisions: [],
        }),
      ],
      nominalTokenBudget: 1000,
      nowMs: frozenNow,
    });
    expect(body).toBe("No prior context for the selected paths.\n");
  });

  it("matches golden brief shape for overlapping files_touched", () => {
    const a = sessionCheckpoint({
      id: "2026-05-01-a",
      created_at: "2026-05-01T10:00:00.000Z",
      files_touched: ["app/foo.ts"],
      decisions: [{ id: "d-a", topic: "A", conclusion: "ca", rationale: "ra", canonical: false }],
      open_questions: ["Still unsure?"],
    });
    const b = sessionCheckpoint({
      id: "2026-05-09-b",
      created_at: "2026-05-09T10:00:00.000Z",
      files_touched: ["app/foo.ts"],
      decisions: [{ id: "d-b", topic: "B", conclusion: "cb", rationale: "rb", canonical: false }],
      open_questions: ["Still unsure?"],
    });
    const { body } = assembleBrief({
      targetPaths: ["app/foo.ts"],
      checkpoints: [a, b],
      nominalTokenBudget: 10_000,
      nowMs: frozenNow,
    });
    expect(body).toMatchInlineSnapshot(`
      "[context]

      2026-05-09-b | d-b | B
      conclusion: cb
      rationale: rb

      2026-05-01-a | d-a | A
      conclusion: ca
      rationale: ra

      [open_questions]

      - Still unsure?
      "
    `);
  });
});

describe("brief helpers", () => {
  it("normalizeRepoPath strips ./ and normalizes slashes", () => {
    expect(normalizeRepoPath("./src/x.ts")).toBe("src/x.ts");
    expect(normalizeRepoPath("src\\\\x.ts")).toBe("src/x.ts");
  });

  it("overlapCount counts intersection with normalized targets", () => {
    const set = new Set(["a/b.ts"]);
    expect(overlapCount(["./a/b.ts"], set)).toBe(1);
  });

  it("estimateTokens is length-based", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("rankScore increases with overlap and decays with age", () => {
    const now = Date.parse("2026-06-01T00:00:00.000Z");
    const fresh = rankScore(2, "2026-05-31T00:00:00.000Z", now);
    const stale = rankScore(2, "2020-01-01T00:00:00.000Z", now);
    expect(fresh).toBeGreaterThan(stale);
    expect(rankScore(3, "2026-05-31T00:00:00.000Z", now)).toBeGreaterThan(rankScore(2, "2026-05-31T00:00:00.000Z", now));
  });
});
