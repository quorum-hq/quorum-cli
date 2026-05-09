import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { assembleBrief, normalizeRepoPath } from "../brief/assemble.js";
import { trackedDiffPathsVsHead } from "../brief/target-paths.js";
import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import {
  filterBriefCheckpointsActiveAtHead,
  loadBriefCheckpointsFromShadow,
  loadRewriteManifestsFromShadow,
} from "../shadow/read-checkpoints.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export function parseBriefArgs(argv: string[]): { paths: string[]; tokens?: number } {
  const paths: string[] = [];
  let tokens: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tokens" && argv[i + 1]) {
      const n = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--tokens must be a positive integer");
      }
      tokens = n;
    } else if (a) {
      paths.push(a);
    }
  }
  return { paths, tokens };
}

function resolveTargetPathsToRepoRelative(gitRoot: string, paths: string[]): string[] {
  const cwd = process.cwd();
  return paths.map((p) => {
    const abs = resolve(cwd, p);
    const rel = relative(gitRoot, abs);
    if (rel.startsWith("..")) {
      return normalizeRepoPath(p);
    }
    return normalizeRepoPath(rel);
  });
}

export function runBrief(gitRoot: string, argv: string[]): void {
  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum brief: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  let parsed: { paths: string[]; tokens?: number };
  try {
    parsed = parseBriefArgs(argv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    eprint(`quorum brief: ${msg}`);
    eprint("  Usage: quorum brief [--tokens N] [path...]");
    process.exit(1);
  }

  const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: gitRoot,
    encoding: "utf-8",
  }).trim();
  const allBrief = loadBriefCheckpointsFromShadow(gitRoot, merged.shadow_branch);
  const manifests = loadRewriteManifestsFromShadow(gitRoot, merged.shadow_branch);
  const checkpoints = filterBriefCheckpointsActiveAtHead(gitRoot, headSha, allBrief, manifests);
  const targetPaths =
    parsed.paths.length > 0 ? resolveTargetPathsToRepoRelative(gitRoot, parsed.paths) : trackedDiffPathsVsHead(gitRoot);

  const nominal = parsed.tokens ?? merged.default_token_budget;
  const { body, stderrOverflow } = assembleBrief({
    targetPaths,
    checkpoints,
    nominalTokenBudget: nominal,
    nowMs: Date.now(),
    shadowSessionCount: allBrief.length,
  });

  if (stderrOverflow) {
    eprint(stderrOverflow.trimEnd());
  }
  process.stdout.write(body);
  process.exit(0);
}
