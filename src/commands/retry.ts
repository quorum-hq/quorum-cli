import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import { distillCommitOrPending } from "../checkpoint/pipeline.js";
import {
  findLatestPendingId,
  readPendingMeta,
  removePendingDir,
  transcriptPathForPending,
} from "../sessions/pending.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export async function runRetry(gitRoot: string): Promise<void> {
  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum retry: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  const pendingId = findLatestPendingId(gitRoot);
  if (!pendingId) {
    eprint("quorum retry: no pending capture under .quorum/sessions/pending/");
    process.exit(1);
  }

  const meta = readPendingMeta(gitRoot, pendingId);
  if (!merged.agents.includes(meta.agent)) {
    eprint(
      `quorum retry: pending capture uses agent ${JSON.stringify(meta.agent)}, which is not enabled in config.`,
    );
    process.exit(1);
  }

  const transcriptAbs = transcriptPathForPending(gitRoot, pendingId);
  const r = await distillCommitOrPending(gitRoot, meta.agent, transcriptAbs, merged, {
    replacePendingId: pendingId,
  });
  if (r.ok) {
    removePendingDir(gitRoot, pendingId);
    process.exit(0);
  }
  process.exit(1);
}
