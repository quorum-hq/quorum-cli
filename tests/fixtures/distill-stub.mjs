#!/usr/bin/env node
/**
 * Test distiller: prints envelope-wrapped session JSON. Finds `.quorum-checkpoint-test-head`
 * by walking parents of the transcript path (supports transcripts under pending/).
 */
import { existsSync, readFileSync } from "node:fs";
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

const checkpoint = {
  id: "ignored-by-validator",
  kind: "session",
  session_id: "550e8400-e29b-41d4-a716-446655440000",
  created_at: "2026-05-09T12:00:00.000Z",
  agent,
  commit_sha: head,
  intent: "Fixture checkpoint from distill-stub.mjs",
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

console.log("fixture: banner line before envelope");
console.log("<<QUORUM_JSON>>");
console.log(JSON.stringify(checkpoint));
console.log("<<END_QUORUM_JSON>>");
console.log("fixture: trailing chatter");
