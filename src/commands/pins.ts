import { basename } from "node:path";
import { parseSessionCheckpointRecord, type SessionCheckpoint } from "../checkpoint/session.js";
import { normalizeRepoPath } from "../brief/assemble.js";
import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import { upsertCheckpointJsonOnShadowBranch } from "../git/shadow-commit.js";
import { listShadowJsonPaths, loadSessionCheckpointsFromShadow, readBlobText } from "../shadow/read-checkpoints.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

function resolveShadowCheckpointPath(gitRoot: string, shadowBranch: string, checkpointId: string): string | null {
  const id = checkpointId.replace(/\.json$/i, "");
  const paths = listShadowJsonPaths(gitRoot, shadowBranch);
  return paths.find((p) => basename(p, ".json") === id) ?? null;
}

function loadCheckpointAtPath(
  gitRoot: string,
  shadowBranch: string,
  shadowPath: string,
): SessionCheckpoint {
  const rawText = readBlobText(gitRoot, shadowBranch, shadowPath);
  const raw = JSON.parse(rawText) as unknown;
  const stem = basename(shadowPath, ".json");
  return parseSessionCheckpointRecord(raw, stem);
}

export function runPin(gitRoot: string, argv: string[]): void {
  if (argv.length !== 2) {
    eprint("quorum pin: expected <checkpoint-id> <decision-id>");
    eprint("  Example: quorum pin 2026-05-09-abc dec-fixture-1");
    process.exit(1);
  }
  const [checkpointId, decisionId] = argv;

  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum pin: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  const shadowPath = resolveShadowCheckpointPath(gitRoot, merged.shadow_branch, checkpointId);
  if (!shadowPath) {
    eprint(`quorum pin: no checkpoint matching id ${JSON.stringify(checkpointId)} on ${merged.shadow_branch}`);
    process.exit(1);
  }

  const cp = loadCheckpointAtPath(gitRoot, merged.shadow_branch, shadowPath);
  const d = cp.decisions.find((x) => x.id === decisionId);
  if (!d) {
    eprint(`quorum pin: no decision ${JSON.stringify(decisionId)} in ${shadowPath}`);
    process.exit(1);
  }
  if (d.canonical) {
    eprint(`quorum pin: decision ${JSON.stringify(decisionId)} is already pinned.`);
    process.exit(0);
  }
  d.canonical = true;
  const body = `${JSON.stringify(cp, null, 2)}\n`;
  upsertCheckpointJsonOnShadowBranch(gitRoot, merged.shadow_branch, shadowPath, body);
  eprint(`quorum pin: pinned ${JSON.stringify(decisionId)} in ${shadowPath}`);
  process.exit(0);
}

export function runUnpin(gitRoot: string, argv: string[]): void {
  if (argv.length !== 2) {
    eprint("quorum unpin: expected <checkpoint-id> <decision-id>");
    process.exit(1);
  }
  const [checkpointId, decisionId] = argv;

  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum unpin: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  const shadowPath = resolveShadowCheckpointPath(gitRoot, merged.shadow_branch, checkpointId);
  if (!shadowPath) {
    eprint(`quorum unpin: no checkpoint matching id ${JSON.stringify(checkpointId)} on ${merged.shadow_branch}`);
    process.exit(1);
  }

  const cp = loadCheckpointAtPath(gitRoot, merged.shadow_branch, shadowPath);
  const d = cp.decisions.find((x) => x.id === decisionId);
  if (!d) {
    eprint(`quorum unpin: no decision ${JSON.stringify(decisionId)} in ${shadowPath}`);
    process.exit(1);
  }
  if (!d.canonical) {
    eprint(`quorum unpin: decision ${JSON.stringify(decisionId)} is not pinned.`);
    process.exit(0);
  }
  d.canonical = false;
  const body = `${JSON.stringify(cp, null, 2)}\n`;
  upsertCheckpointJsonOnShadowBranch(gitRoot, merged.shadow_branch, shadowPath, body);
  eprint(`quorum unpin: unpinned ${JSON.stringify(decisionId)} in ${shadowPath}`);
  process.exit(0);
}

function pathPrefixGroup(filesTouched: string[]): string {
  if (filesTouched.length === 0) {
    return "(no paths)";
  }
  const first = normalizeRepoPath(filesTouched[0]);
  const slash = first.indexOf("/");
  if (slash === -1) {
    return first;
  }
  return `${first.slice(0, slash + 1)}`;
}

export function runPinsList(gitRoot: string): void {
  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum pins: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  const checkpoints = loadSessionCheckpointsFromShadow(gitRoot, merged.shadow_branch);
  type Row = { group: string; checkpointId: string; decisionId: string; topic: string; conclusion: string };
  const rows: Row[] = [];
  for (const cp of checkpoints) {
    for (const d of cp.decisions) {
      if (!d.canonical) continue;
      rows.push({
        group: pathPrefixGroup(cp.files_touched),
        checkpointId: cp.id,
        decisionId: d.id,
        topic: d.topic,
        conclusion: d.conclusion,
      });
    }
  }

  if (rows.length === 0) {
    process.stdout.write("No pinned decisions on the shadow branch.\n");
    process.exit(0);
  }

  rows.sort((a, b) => {
    const g = a.group.localeCompare(b.group);
    if (g !== 0) return g;
    return `${a.checkpointId}/${a.decisionId}`.localeCompare(`${b.checkpointId}/${b.decisionId}`);
  });

  let lastGroup = "";
  for (const r of rows) {
    if (r.group !== lastGroup) {
      if (lastGroup !== "") process.stdout.write("\n");
      process.stdout.write(`${r.group}\n`);
      lastGroup = r.group;
    }
    process.stdout.write(`  ${r.checkpointId} | ${r.decisionId} — ${r.topic}: ${r.conclusion}\n`);
  }
  process.exit(0);
}
