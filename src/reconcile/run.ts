import type { QuorumMergedConfig } from "../config/constants.js";
import type { SessionCheckpoint } from "../checkpoint/session.js";
import { loadSessionCheckpointsFromShadow } from "../shadow/read-checkpoints.js";
import { upsertCheckpointJsonOnShadowBranch } from "../git/shadow-commit.js";
import { serializeRewriteManifest, type RewriteManifestV1 } from "./manifest.js";
import { parseReconcileArgs, type ReconcileCliArgs } from "./parse-args.js";

function uniqueStrings(xs: string[]): string[] {
  return [...new Set(xs)];
}

export function buildRewriteManifestFromReconcile(
  parsed: ReconcileCliArgs,
  allSessions: SessionCheckpoint[],
): RewriteManifestV1 {
  const absorbed = new Set<string>(parsed.checkpoints);
  if (parsed.pr !== undefined) {
    for (const cp of allSessions) {
      if (cp.pr_number === parsed.pr) {
        absorbed.add(cp.id);
      }
    }
  }

  const knownIds = new Set(allSessions.map((c) => c.id));
  for (const id of absorbed) {
    if (!knownIds.has(id)) {
      throw new Error(`unknown checkpoint id ${JSON.stringify(id)} (no matching session JSON on shadow branch)`);
    }
  }

  if (absorbed.size === 0) {
    throw new Error("no checkpoints matched this reconcile invocation (check --checkpoint ids and/or --pr)");
  }

  const manifest: RewriteManifestV1 = {
    kind: "rewrite",
    version: 1,
    landing_commit_sha: parsed.landing,
    absorbed_checkpoint_ids: uniqueStrings([...absorbed]).sort(),
  };
  if (parsed.pr !== undefined) {
    manifest.pr_number = parsed.pr;
  }
  return manifest;
}

export function rewriteManifestPath(landingSha: string): string {
  return `rewrite/${landingSha.toLowerCase()}.json`;
}

/** Parse `git post-rewrite` stdin: lines of `<old-sha> <new-sha>`. */
export function parsePostRewriteMappings(stdinText: string): Map<string, Set<string>> {
  /** new_sha -> set of old_sha */
  const byNew = new Map<string, Set<string>>();
  for (const line of stdinText.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 2) continue;
    const oldSha = parts[0].toLowerCase();
    const newSha = parts[1].toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(oldSha) || !/^[0-9a-f]{40}$/.test(newSha)) {
      continue;
    }
    let set = byNew.get(newSha);
    if (!set) {
      set = new Set<string>();
      byNew.set(newSha, set);
    }
    set.add(oldSha);
  }
  return byNew;
}

export function buildManifestsFromPostRewriteMappings(
  mappings: Map<string, Set<string>>,
  allSessions: SessionCheckpoint[],
): RewriteManifestV1[] {
  const out: RewriteManifestV1[] = [];
  for (const [newSha, oldShas] of mappings) {
    const absorbed: string[] = [];
    for (const cp of allSessions) {
      const c = cp.commit_sha.toLowerCase();
      if (oldShas.has(c)) {
        absorbed.push(cp.id);
      }
    }
    if (absorbed.length === 0) {
      continue;
    }
    out.push({
      kind: "rewrite",
      version: 1,
      landing_commit_sha: newSha,
      absorbed_checkpoint_ids: uniqueStrings(absorbed).sort(),
    });
  }
  return out;
}

export function commitRewriteManifest(
  gitRoot: string,
  shadowBranch: string,
  manifest: RewriteManifestV1,
): string {
  const path = rewriteManifestPath(manifest.landing_commit_sha);
  const body = serializeRewriteManifest(manifest);
  upsertCheckpointJsonOnShadowBranch(gitRoot, shadowBranch, path, body);
  return path;
}

export function runReconcileCli(gitRoot: string, merged: QuorumMergedConfig, argv: string[]): void {
  const parsed = parseReconcileArgs(argv);
  const allSessions = loadSessionCheckpointsFromShadow(gitRoot, merged.shadow_branch);
  if (parsed.checkpoints.length === 0 && parsed.pr === undefined) {
    throw new Error("provide at least one --checkpoint <id> and/or --pr <n>");
  }
  const manifest = buildRewriteManifestFromReconcile(parsed, allSessions);
  const path = commitRewriteManifest(gitRoot, merged.shadow_branch, manifest);
  process.stderr.write(`quorum: rewrite manifest written on ${merged.shadow_branch} as ${path}\n`);
}

export function runPostRewriteFromStdin(gitRoot: string, merged: QuorumMergedConfig, stdinText: string): void {
  const mappings = parsePostRewriteMappings(stdinText);
  if (mappings.size === 0) {
    return;
  }
  const allSessions = loadSessionCheckpointsFromShadow(gitRoot, merged.shadow_branch);
  const manifests = buildManifestsFromPostRewriteMappings(mappings, allSessions);
  for (const m of manifests) {
    const path = commitRewriteManifest(gitRoot, merged.shadow_branch, m);
    process.stderr.write(`quorum: post-rewrite manifest on ${merged.shadow_branch} as ${path}\n`);
  }
}
