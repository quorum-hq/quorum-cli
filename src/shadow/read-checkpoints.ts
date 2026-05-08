import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import {
  CheckpointValidationError,
  parseSessionCheckpointRecord,
  type SessionCheckpoint,
} from "../checkpoint/session.js";

export function listShadowJsonPaths(gitRoot: string, shadowBranch: string): string[] {
  let out: string;
  try {
    out = execFileSync("git", ["ls-tree", "-r", "--name-only", shadowBranch], {
      cwd: gitRoot,
      encoding: "utf-8",
    });
  } catch {
    return [];
  }
  const paths = out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".json"));
  paths.sort();
  return paths;
}

export function readBlobText(gitRoot: string, shadowBranch: string, path: string): string {
  return execFileSync("git", ["show", `${shadowBranch}:${path}`], {
    cwd: gitRoot,
    encoding: "utf-8",
  });
}

/** Load and parse session checkpoints from the shadow branch tip (skips invalid JSON). */
export function loadSessionCheckpointsFromShadow(gitRoot: string, shadowBranch: string): SessionCheckpoint[] {
  const paths = listShadowJsonPaths(gitRoot, shadowBranch);
  const out: SessionCheckpoint[] = [];
  for (const p of paths) {
    try {
      const rawText = readBlobText(gitRoot, shadowBranch, p);
      const raw = JSON.parse(rawText) as unknown;
      const stem = basename(p, ".json");
      out.push(parseSessionCheckpointRecord(raw, stem));
    } catch (e) {
      if (e instanceof SyntaxError || e instanceof CheckpointValidationError) {
        continue;
      }
      throw e;
    }
  }
  return out;
}
