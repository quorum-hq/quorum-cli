#!/usr/bin/env node
/**
 * Like distill-stub.mjs but sleeps first so session-end hook latency is observable.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const agent = process.argv[2];
const transcriptPath = process.argv[3];

await new Promise((r) => setTimeout(r, 2500));

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

const checkpoint = {
  id: "ignored-by-validator",
  kind: "session",
  session_id: "550e8400-e29b-41d4-a716-446655440000",
  created_at: "2026-05-09T12:00:00.000Z",
  agent,
  commit_sha: head,
  intent: "Fixture checkpoint from slow-distill-stub.mjs",
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
