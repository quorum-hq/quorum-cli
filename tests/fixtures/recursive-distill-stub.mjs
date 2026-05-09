#!/usr/bin/env node
/**
 * Test distiller that simulates the recursion bug: a real `claude --print …` distill
 * subprocess would itself fire `SessionEnd` on its own transcript, re-invoking
 * `quorum internal claude-session-end`. This stub does that synchronously so the
 * regression test can assert the inner hook is suppressed by the QUORUM_DISTILL_CHILD
 * sentinel set in `distillCommitOrPending`.
 *
 * Inputs:
 *   argv[2]: agent id
 *   argv[3]: absolute transcript path (the capture of the outer session)
 *   env QUORUM_TEST_GIT_ROOT: repo root used to write a fresh inner-transcript file
 *   env QUORUM_TEST_CLI: absolute path to dist/cli.js
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const agent = process.argv[2];
const transcriptPath = process.argv[3];

function readHeadSha() {
  let dir = dirname(transcriptPath);
  for (;;) {
    const candidate = join(dir, ".quorum-checkpoint-test-head");
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8").trim();
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not find .quorum-checkpoint-test-head walking up from transcript path");
    }
    dir = parent;
  }
}

const head = readHeadSha();

const gitRoot = process.env.QUORUM_TEST_GIT_ROOT;
const cliPath = process.env.QUORUM_TEST_CLI;
if (!gitRoot || !cliPath) {
  throw new Error("recursive-distill-stub requires QUORUM_TEST_GIT_ROOT and QUORUM_TEST_CLI");
}

const innerTranscript = join(gitRoot, `inner-transcript-${process.pid}.txt`);
writeFileSync(innerTranscript, "fixture inner transcript\n", "utf-8");

const r = spawnSync(
  process.execPath,
  [cliPath, "internal", `${agent === "claude-code" ? "claude" : agent}-session-end`],
  {
    cwd: gitRoot,
    encoding: "utf-8",
    input: JSON.stringify({ transcript_path: innerTranscript }),
    env: process.env,
  },
);

process.stderr.write(
  `recursive-distill-stub: inner hook status=${r.status} stderr=${(r.stderr ?? "").trim()}\n`,
);

const checkpoint = {
  id: "ignored-by-validator",
  kind: "session",
  session_id: "550e8400-e29b-41d4-a716-446655440000",
  created_at: "2026-05-09T12:00:00.000Z",
  agent,
  commit_sha: head,
  intent: "Fixture checkpoint from recursive-distill-stub.mjs",
  decisions: [
    {
      id: "dec-fixture-1",
      topic: "Fixture",
      conclusion: "Stub ran",
      rationale: "Integration test harness",
      canonical: false,
    },
  ],
  files_touched: ["README.md"],
  open_questions: [],
};

console.log("<<QUORUM_JSON>>");
console.log(JSON.stringify(checkpoint));
console.log("<<END_QUORUM_JSON>>");
