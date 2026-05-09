import { describe, expect, it } from "vitest";
import { parseAndNormalizeSquashRollupCheckpoint, parseSquashRollupCheckpointRecord } from "../src/checkpoint/squash-rollup.js";

const LANDING = "cafebabecafebabecafebabecafebabecafebabe";

function minimalRollupJson(): Record<string, unknown> {
  return {
    kind: "squash_rollup",
    rollup_id: "550e8400-e29b-41d4-a716-446655440099",
    created_at: "2026-05-09T12:00:00.000Z",
    agent: "claude-code",
    commit_sha: LANDING,
    intent: "rollup fixture",
    sources: ["sess-a", "sess-b"],
    decisions: [
      {
        id: "dec-rollup-1",
        topic: "Rollup",
        conclusion: "Merged narrative",
        rationale: "squash",
        canonical: false,
      },
    ],
    files_touched: ["README.md"],
    open_questions: [],
  };
}

describe("squash_rollup checkpoint parsing", () => {
  it("parses a valid squash_rollup record and assigns id from filename stem", () => {
    const raw = minimalRollupJson();
    const cp = parseSquashRollupCheckpointRecord(raw, "2026-05-09-roll");
    expect(cp.kind).toBe("squash_rollup");
    expect(cp.id).toBe("2026-05-09-roll");
    expect(cp.commit_sha).toBe(LANDING.toLowerCase());
    expect(cp.sources).toEqual(["sess-a", "sess-b"]);
    expect(cp.decisions[0]?.id).toBe("dec-rollup-1");
  });

  it("requires sources as a non-empty string array", () => {
    const raw = { ...minimalRollupJson(), sources: [] };
    expect(() => parseSquashRollupCheckpointRecord(raw, "x")).toThrow(/sources/);
  });

  it("normalize forces commit_sha to landing sha", () => {
    const raw = minimalRollupJson();
    (raw as { commit_sha: string }).commit_sha = LANDING;
    const cp = parseAndNormalizeSquashRollupCheckpoint(raw, LANDING.toUpperCase(), "stem");
    expect(cp.commit_sha).toBe(LANDING.toLowerCase());
  });

  it("normalize rejects commit_sha mismatch vs landing", () => {
    const raw = minimalRollupJson();
    raw.commit_sha = "b".repeat(40);
    expect(() => parseAndNormalizeSquashRollupCheckpoint(raw, LANDING, "stem")).toThrow(/commit_sha/);
  });
});
