import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import { ALLOWED_AGENT_IDS, type AgentId } from "../config/constants.js";
import {
  assertTranscriptExists,
  distillCommitOrPending,
  parseCheckpointCliArgs,
  resolveTranscriptPath,
} from "../checkpoint/pipeline.js";
import { ShadowPushFailure } from "../git/shadow-push.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export async function runCheckpoint(gitRoot: string, argv: string[]): Promise<void> {
  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum checkpoint: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  let parsed: { agent: string; transcript: string };
  try {
    parsed = parseCheckpointCliArgs(argv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    eprint(`quorum checkpoint: ${msg}`);
    eprint(
      "  Usage: quorum checkpoint --agent <claude-code> <transcript-file>\n" +
        "  Other agent ids remain valid if listed in `.quorum/config.json` (experimental in v0.1; use QUORUM_DISTILL_WRAPPER for deterministic distill).",
    );
    process.exit(1);
  }

  if (!(ALLOWED_AGENT_IDS as readonly string[]).includes(parsed.agent)) {
    eprint(
      `quorum checkpoint: unknown agent kind ${JSON.stringify(parsed.agent)} — supported: ${ALLOWED_AGENT_IDS.join(", ")}`,
    );
    process.exit(1);
  }
  const agent = parsed.agent as AgentId;
  if (!merged.agents.includes(agent)) {
    eprint(
      `quorum checkpoint: agent ${JSON.stringify(agent)} is not listed in ".quorum/config.json" "agents".\n` +
        "  Add it there (team policy) or use another enabled agent.",
    );
    process.exit(1);
  }

  const transcriptAbs = resolveTranscriptPath(parsed.transcript);
  try {
    assertTranscriptExists(transcriptAbs);
  } catch (e) {
    eprint(`quorum checkpoint: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  try {
    const r = await distillCommitOrPending(gitRoot, agent, transcriptAbs, merged);
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    if (e instanceof ShadowPushFailure) {
      eprint(`quorum checkpoint: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}
