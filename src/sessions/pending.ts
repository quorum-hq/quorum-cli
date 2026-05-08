import { randomUUID } from "node:crypto";
import { existsSync, copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../config/constants.js";
import { quorumPendingDir, quorumSessionsDir } from "../paths.js";

export type PendingReason =
  | "timeout"
  | "nonzero_exit"
  | "spawn_error"
  | "envelope"
  | "validation"
  | "missing_transcript";

export type PendingMeta = {
  pending_id: string;
  created_at: string;
  agent: AgentId;
  head_sha: string;
  transcript_file: string;
  reason: PendingReason;
  detail?: string;
  last_stdout_tail?: string;
};

export function writePendingCapture(
  gitRoot: string,
  opts: {
    agent: AgentId;
    headSha: string;
    transcriptPath: string;
    reason: PendingReason;
    detail?: string;
    lastStdoutTail?: string;
  },
): string {
  mkdirSync(quorumSessionsDir(gitRoot), { recursive: true });
  mkdirSync(quorumPendingDir(gitRoot), { recursive: true });
  const id = randomUUID();
  const dir = join(quorumPendingDir(gitRoot), id);
  mkdirSync(dir, { recursive: true });
  const destTranscript = join(dir, "transcript.txt");
  copyFileSync(opts.transcriptPath, destTranscript);
  const meta: PendingMeta = {
    pending_id: id,
    created_at: new Date().toISOString(),
    agent: opts.agent,
    head_sha: opts.headSha,
    transcript_file: "transcript.txt",
    reason: opts.reason,
    detail: opts.detail,
    last_stdout_tail: opts.lastStdoutTail,
  };
  writeFileSync(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
  return id;
}

export function readPendingMeta(gitRoot: string, pendingId: string): PendingMeta {
  const raw = readFileSync(join(quorumPendingDir(gitRoot), pendingId, "meta.json"), "utf-8");
  return JSON.parse(raw) as PendingMeta;
}

export function transcriptPathForPending(gitRoot: string, pendingId: string): string {
  const meta = readPendingMeta(gitRoot, pendingId);
  return join(quorumPendingDir(gitRoot), pendingId, meta.transcript_file);
}

export function removePendingDir(gitRoot: string, pendingId: string): void {
  rmSync(join(quorumPendingDir(gitRoot), pendingId), { recursive: true, force: true });
}

/** Latest pending by `created_at` (ISO lexicographic); tie-breaker prefers greater `pending_id`. */
export function findLatestPendingId(gitRoot: string): string | null {
  const base = quorumPendingDir(gitRoot);
  if (!existsSync(base)) {
    return null;
  }
  let bestId: string | null = null;
  let bestCreated = "";
  for (const ent of readdirSync(base, { withFileTypes: true })) {
    if (!ent.isDirectory()) {
      continue;
    }
    const id = ent.name;
    const metaPath = join(base, id, "meta.json");
    if (!existsSync(metaPath)) {
      continue;
    }
    let created: string;
    try {
      const meta = readPendingMeta(gitRoot, id);
      created = meta.created_at;
    } catch {
      continue;
    }
    if (created > bestCreated || (created === bestCreated && id > (bestId ?? ""))) {
      bestCreated = created;
      bestId = id;
    }
  }
  return bestId;
}
