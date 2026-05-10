import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { AgentId, QuorumMergedConfig } from "../config/constants.js";
import { resolveRollupDistillCommand, ROLLUP_DISTILL_WRAPPER_ENV } from "../distill/resolve-command.js";
import { spawnDistillerWithTimeout } from "../distill/spawn.js";
import { extractJsonFromEnvelope, EnvelopeParseError } from "../envelope/extract.js";
import { maybePushShadowBranchAfterCommit } from "../git/shadow-push.js";
import { commitCheckpointJsonOnShadowBranch } from "../git/shadow-commit.js";
import { registerDistillInflight, unregisterDistillInflight } from "../sessions/distill-inflight.js";
import { CheckpointValidationError } from "./session.js";
import { parseAndNormalizeSquashRollupCheckpoint } from "./squash-rollup.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export async function distillAndCommitSquashRollup(opts: {
  gitRoot: string;
  merged: QuorumMergedConfig;
  landingSha: string;
  sources: string[];
  agent: AgentId;
  transcriptAbs: string;
  killGraceMs?: number;
}): Promise<{ filename: string }> {
  if (!existsSync(opts.transcriptAbs)) {
    throw new Error(`rollup transcript file not found: ${opts.transcriptAbs}`);
  }
  if (opts.sources.length === 0) {
    throw new Error("internal error: rollup sources empty");
  }

  registerDistillInflight(opts.gitRoot);
  try {
    return await distillAndCommitSquashRollupBody(opts);
  } finally {
    unregisterDistillInflight(opts.gitRoot);
  }
}

async function distillAndCommitSquashRollupBody(opts: {
  gitRoot: string;
  merged: QuorumMergedConfig;
  landingSha: string;
  sources: string[];
  agent: AgentId;
  transcriptAbs: string;
  killGraceMs?: number;
}): Promise<{ filename: string }> {
  const timeoutMs = opts.merged.distill_cli_timeout_seconds * 1000;
  const { command, args } = resolveRollupDistillCommand(opts.agent, opts.transcriptAbs);
  const spawnRes = await spawnDistillerWithTimeout({
    command,
    args,
    cwd: opts.gitRoot,
    env: { ...process.env },
    timeoutMs,
    killGraceMs: opts.killGraceMs,
  });

  if (!spawnRes.ok) {
    const detail = spawnRes.error ?? (spawnRes.stderr.trim() || spawnRes.stdout.trim());
    if (spawnRes.reason === "timeout") {
      eprint(
        "quorum reconcile: rollup distillation timed out.\n" +
          "  Raise `distill_cli_timeout_seconds` in `.quorum/local.json`, shrink the transcript, or fix a stuck agent CLI.",
      );
    } else if (spawnRes.reason === "spawn_error") {
      eprint(
        `quorum reconcile: could not run rollup distiller (${command}): ${detail}\n` +
          `  Install the agent CLI on PATH, set ${ROLLUP_DISTILL_WRAPPER_ENV}, or set QUORUM_DISTILL_WRAPPER for tests.`,
      );
    } else {
      eprint(`quorum reconcile: rollup distiller exited non-zero.\n${spawnRes.stderr}`);
    }
    throw new Error("rollup distillation failed");
  }

  let extracted: unknown;
  try {
    extracted = extractJsonFromEnvelope(spawnRes.stdout);
  } catch (e) {
    const msg = e instanceof EnvelopeParseError ? e.message : e instanceof Error ? e.message : String(e);
    eprint(`quorum reconcile: rollup distill envelope: ${msg}`);
    throw new Error("rollup distillation failed");
  }

  const date = new Date().toISOString().slice(0, 10);
  const fileBase = `rollup-${date}-${randomUUID()}`;
  const filename = `${fileBase}.json`;
  try {
    const checkpoint = parseAndNormalizeSquashRollupCheckpoint(extracted, opts.landingSha, fileBase);
    checkpoint.sources = [...opts.sources];
    const body = `${JSON.stringify(checkpoint, null, 2)}\n`;
    commitCheckpointJsonOnShadowBranch(opts.gitRoot, opts.merged.shadow_branch, filename, body);
    eprint(`quorum: squash rollup checkpoint committed on ${opts.merged.shadow_branch} as ${filename}`);
    maybePushShadowBranchAfterCommit(opts.gitRoot, opts.merged);
    return { filename };
  } catch (e) {
    const msg = e instanceof CheckpointValidationError ? e.message : String(e);
    eprint(`quorum reconcile: invalid squash rollup checkpoint: ${msg}`);
    throw new Error("rollup distillation failed");
  }
}
