import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import {
  CheckpointValidationError,
  parseSessionCheckpointRecord,
  type SessionCheckpoint,
} from "../checkpoint/session.js";
import { parseSquashRollupCheckpointRecord, type BriefCheckpoint } from "../checkpoint/squash-rollup.js";
import { isCommitAncestorOf } from "../git/ancestors.js";
import { tryParseRewriteManifestJson, type RewriteManifestV1 } from "../reconcile/manifest.js";

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

function checkpointKindFromJson(raw: unknown): string | null {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw) && typeof (raw as { kind?: unknown }).kind === "string") {
    return (raw as { kind: string }).kind;
  }
  return null;
}

/** Load and parse session checkpoints from the shadow branch tip (skips invalid JSON). */
export function loadSessionCheckpointsFromShadow(gitRoot: string, shadowBranch: string): SessionCheckpoint[] {
  const paths = listShadowJsonPaths(gitRoot, shadowBranch);
  const out: SessionCheckpoint[] = [];
  for (const p of paths) {
    try {
      const rawText = readBlobText(gitRoot, shadowBranch, p);
      const raw = JSON.parse(rawText) as unknown;
      if (checkpointKindFromJson(raw) !== "session") {
        continue;
      }
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

/** Session checkpoints plus squash rollup narratives stored as JSON on the shadow branch. */
export function loadBriefCheckpointsFromShadow(gitRoot: string, shadowBranch: string): BriefCheckpoint[] {
  const paths = listShadowJsonPaths(gitRoot, shadowBranch);
  const out: BriefCheckpoint[] = [];
  for (const p of paths) {
    try {
      const rawText = readBlobText(gitRoot, shadowBranch, p);
      const raw = JSON.parse(rawText) as unknown;
      const stem = basename(p, ".json");
      const kind = checkpointKindFromJson(raw);
      if (kind === "session") {
        out.push(parseSessionCheckpointRecord(raw, stem));
      } else if (kind === "squash_rollup") {
        out.push(parseSquashRollupCheckpointRecord(raw, stem));
      }
    } catch (e) {
      if (e instanceof SyntaxError || e instanceof CheckpointValidationError) {
        continue;
      }
      throw e;
    }
  }
  return out;
}

export function loadRewriteManifestsFromShadow(gitRoot: string, shadowBranch: string): RewriteManifestV1[] {
  const paths = listShadowJsonPaths(gitRoot, shadowBranch);
  const out: RewriteManifestV1[] = [];
  for (const p of paths) {
    let rawText: string;
    try {
      rawText = readBlobText(gitRoot, shadowBranch, p);
    } catch {
      continue;
    }
    const m = tryParseRewriteManifestJson(rawText, p);
    if (m) {
      out.push(m);
    }
  }
  return out;
}

/**
 * Checkpoints whose `commit_sha` is still reachable from `headSha`, plus any checkpoint ids
 * listed on a rewrite manifest whose `landing_commit_sha` matches `headSha`.
 */
export function filterBriefCheckpointsActiveAtHead(
  gitRoot: string,
  headSha: string,
  all: BriefCheckpoint[],
  manifests: RewriteManifestV1[],
): BriefCheckpoint[] {
  const head = headSha.toLowerCase();
  const absorbed = new Set<string>();
  for (const m of manifests) {
    if (m.landing_commit_sha === head) {
      for (const id of m.absorbed_checkpoint_ids) {
        absorbed.add(id);
      }
    }
  }
  return all.filter((cp) => {
    if (absorbed.has(cp.id)) {
      return true;
    }
    return isCommitAncestorOf(gitRoot, cp.commit_sha, head);
  });
}

export function filterSessionCheckpointsActiveAtHead(
  gitRoot: string,
  headSha: string,
  all: SessionCheckpoint[],
  manifests: RewriteManifestV1[],
): SessionCheckpoint[] {
  return filterBriefCheckpointsActiveAtHead(gitRoot, headSha, all, manifests) as SessionCheckpoint[];
}

export function loadSessionCheckpointsActiveAtHead(
  gitRoot: string,
  shadowBranch: string,
  headSha: string,
): SessionCheckpoint[] {
  const all = loadSessionCheckpointsFromShadow(gitRoot, shadowBranch);
  const manifests = loadRewriteManifestsFromShadow(gitRoot, shadowBranch);
  return filterSessionCheckpointsActiveAtHead(gitRoot, headSha, all, manifests);
}
