import { describe, expect, it } from "vitest";
import { CheckpointValidationError, parseAndNormalizeSessionCheckpoint } from "../src/checkpoint/session.js";

const HEAD = "a".repeat(40);

function minimalCheckpoint(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "ignored",
    kind: "session",
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    created_at: "2026-05-09T12:00:00Z",
    agent: "claude-code",
    commit_sha: HEAD,
    intent: "Test intent",
    decisions: [
      {
        id: "d1",
        topic: "t",
        conclusion: "c",
        rationale: "r",
        canonical: false,
      },
    ],
    files_touched: ["src/x.ts"],
    open_questions: [],
    ...overrides,
  };
}

describe("parseAndNormalizeSessionCheckpoint", () => {
  it("accepts a minimal valid session checkpoint and sets id from fileId", () => {
    const c = parseAndNormalizeSessionCheckpoint(minimalCheckpoint(), HEAD, "2026-05-09-abc");
    expect(c.id).toBe("2026-05-09-abc");
    expect(c.commit_sha).toBe(HEAD.toLowerCase());
    expect(c.kind).toBe("session");
  });

  it("rejects token_usage with zeros", () => {
    expect(() =>
      parseAndNormalizeSessionCheckpoint(
        minimalCheckpoint({ token_usage: { input: 0, output: 1 } }),
        HEAD,
        "id",
      ),
    ).toThrow(CheckpointValidationError);
  });

  it("rejects commit_sha that does not match HEAD", () => {
    expect(() =>
      parseAndNormalizeSessionCheckpoint(minimalCheckpoint({ commit_sha: "b".repeat(40) }), HEAD, "id"),
    ).toThrow(CheckpointValidationError);
  });

  it("rejects unknown agent string", () => {
    expect(() =>
      parseAndNormalizeSessionCheckpoint(minimalCheckpoint({ agent: "unknown-agent" }), HEAD, "id"),
    ).toThrow(CheckpointValidationError);
  });
});
