import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentId } from "../config/constants.js";
import type { QuorumMergedConfig } from "../config/constants.js";
import { parseAndNormalizeSessionCheckpoint, CheckpointValidationError } from "./session.js";
import { extractJsonFromEnvelope, EnvelopeParseError } from "../envelope/extract.js";
import { resolveDistillCommand } from "../distill/resolve-command.js";
import { spawnDistillerWithTimeout } from "../distill/spawn.js";
import { commitCheckpointJsonOnShadowBranch } from "../git/shadow-commit.js";
import { writePendingCapture, removePendingDir } from "../sessions/pending.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export type DistillPipelineOptions = {
  /** When re-running `quorum retry`, remove this pending directory before recording a new failure. */
  replacePendingId?: string;
  killGraceMs?: number;
};

export async function distillCommitOrPending(
  gitRoot: string,
  agent: AgentId,
  transcriptAbs: string,
  merged: QuorumMergedConfig,
  options: DistillPipelineOptions = {},
): Promise<{ ok: true; filename: string } | { ok: false }> {
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: gitRoot,
    encoding: "utf-8",
  }).trim();

  const timeoutMs = merged.distill_cli_timeout_seconds * 1000;
  const { command, args } = resolveDistillCommand(agent, transcriptAbs);
  const spawnRes = await spawnDistillerWithTimeout({
    command,
    args,
    cwd: gitRoot,
    env: { ...process.env },
    timeoutMs,
    killGraceMs: options.killGraceMs,
  });

  const recordFailure = (opts: {
    reason: "timeout" | "nonzero_exit" | "spawn_error" | "envelope" | "validation";
    detail?: string;
    lastStdout: string;
  }) => {
    if (options.replacePendingId) {
      removePendingDir(gitRoot, options.replacePendingId);
    }
    writePendingCapture(gitRoot, {
      agent,
      headSha,
      transcriptPath: transcriptAbs,
      reason: opts.reason,
      detail: opts.detail,
      lastStdoutTail: opts.lastStdout.slice(-4096),
    });
  };

  if (!spawnRes.ok) {
    const detail = spawnRes.error ?? (spawnRes.stderr.trim() || spawnRes.stdout.trim());
    recordFailure({
      reason: spawnRes.reason,
      detail,
      lastStdout: spawnRes.stdout,
    });
    if (spawnRes.reason === "timeout") {
      eprint(
        "quorum checkpoint: distillation timed out; saved capture under .quorum/sessions/pending/.\n" +
          "  Raise `distill_cli_timeout_seconds` in `.quorum/local.json`, shrink the transcript, or fix a stuck agent CLI; then run `quorum retry`.",
      );
    } else if (spawnRes.reason === "spawn_error") {
      eprint(
        `quorum checkpoint: could not run distiller (${command}): ${detail}\n` +
          "  Install the agent CLI on PATH for this agent, or set QUORUM_DISTILL_WRAPPER to an executable for tests.\n" +
          "  Capture saved under .quorum/sessions/pending/. Run `quorum retry` after fixing the environment.",
      );
    } else {
      eprint(
        "quorum checkpoint: distiller exited with a non-zero status.\n" +
          `  stderr:\n${spawnRes.stderr}\n` +
          "  Capture saved under .quorum/sessions/pending/. Run `quorum retry` after fixing the agent CLI or rubric.",
      );
    }
    return { ok: false };
  }

  let extracted: unknown;
  try {
    extracted = extractJsonFromEnvelope(spawnRes.stdout);
  } catch (e) {
    const msg = e instanceof EnvelopeParseError ? e.message : e instanceof Error ? e.message : String(e);
    recordFailure({ reason: "envelope", detail: msg, lastStdout: spawnRes.stdout });
    eprint(`quorum checkpoint: ${msg}`);
    eprint(
      "  Capture saved under .quorum/sessions/pending/. Run `quorum retry` after ensuring the distiller prints the documented envelope markers.",
    );
    return { ok: false };
  }

  const date = new Date().toISOString().slice(0, 10);
  const fileBase = `${date}-${randomUUID()}`;
  const filename = `${fileBase}.json`;
  try {
    const checkpoint = parseAndNormalizeSessionCheckpoint(extracted, headSha, fileBase);
    const body = `${JSON.stringify(checkpoint, null, 2)}\n`;
    commitCheckpointJsonOnShadowBranch(gitRoot, merged.shadow_branch, filename, body);
    eprint(`quorum: checkpoint committed on ${merged.shadow_branch} as ${filename}`);
    return { ok: true, filename };
  } catch (e) {
    const msg = e instanceof CheckpointValidationError ? e.message : String(e);
    recordFailure({ reason: "validation", detail: msg, lastStdout: spawnRes.stdout });
    eprint(`quorum checkpoint: invalid checkpoint: ${msg}`);
    eprint(
      "  Capture saved under .quorum/sessions/pending/. Run `quorum retry` after aligning JSON with the session checkpoint contract (including matching HEAD commit_sha).",
    );
    return { ok: false };
  }
}

export function parseCheckpointCliArgs(argv: string[]): { agent: string; transcript: string } {
  let agent: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--agent" && argv[i + 1]) {
      agent = argv[++i];
    } else if (a) {
      rest.push(a);
    }
  }
  if (!agent) {
    throw new Error('missing required flag --agent <id> (e.g. --agent claude-code)');
  }
  if (rest.length !== 1) {
    throw new Error("expected exactly one transcript file path after flags");
  }
  return { agent, transcript: rest[0] };
}

export function resolveTranscriptPath(transcriptArg: string): string {
  return resolve(process.cwd(), transcriptArg);
}

export function assertTranscriptExists(transcriptAbs: string): void {
  if (!existsSync(transcriptAbs)) {
    throw new Error(`transcript file not found: ${transcriptAbs}`);
  }
}
