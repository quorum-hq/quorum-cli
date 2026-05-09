#!/usr/bin/env node
/**
 * Test rollup distiller: emits squash_rollup JSON. Reads `.quorum-rollup-test-landing` walking up from transcript path.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const agent = process.argv[2];
const transcriptPath = process.argv[3];

function readLandingSha() {
  let dir = dirname(transcriptPath);
  for (;;) {
    const candidate = join(dir, ".quorum-rollup-test-landing");
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8").trim();
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not find .quorum-rollup-test-landing walking up from transcript path");
    }
    dir = parent;
  }
}

const landing = readLandingSha();

const checkpoint = {
  kind: "squash_rollup",
  rollup_id: "550e8400-e29b-41d4-a716-446655440077",
  created_at: "2026-05-09T12:00:00.000Z",
  agent,
  commit_sha: landing,
  intent: "Fixture rollup from rollup-distill-stub.mjs",
  sources: ["placeholder-source"],
  decisions: [
    {
      id: "dec-rollup-stub",
      topic: "Rollup fixture",
      conclusion: "merged",
      rationale: "Integration harness",
      canonical: false,
    },
  ],
  files_touched: ["README.md"],
  open_questions: [],
};

console.log("<<QUORUM_JSON>>");
console.log(JSON.stringify(checkpoint));
console.log("<<END_QUORUM_JSON>>");
