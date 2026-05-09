import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { distillCommitOrPending } from "../checkpoint/pipeline.js";
import { runSessionEndHookForAgent } from "../agent-hooks/session-end.js";
import { ALLOWED_AGENT_IDS, type AgentId } from "../config/constants.js";
import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import { ShadowPushFailure } from "../git/shadow-push.js";
import { runPostRewriteFromStdin } from "../reconcile/run.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export async function runInternal(gitRoot: string, argv: string[]): Promise<void> {
  const sub = argv[0];
  if (sub === "post-rewrite") {
    let merged;
    try {
      merged = loadMergedConfig(gitRoot);
    } catch (e) {
      if (e instanceof ConfigError) {
        eprint(`quorum internal post-rewrite: ${e.message}`);
        process.exit(0);
      }
      throw e;
    }
    let stdinText = "";
    try {
      stdinText = readFileSync(0, "utf-8");
    } catch {
      stdinText = "";
    }
    try {
      runPostRewriteFromStdin(gitRoot, merged, stdinText);
    } catch (e) {
      if (e instanceof ShadowPushFailure) {
        eprint(`quorum internal post-rewrite: ${e.message}`);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        eprint(`quorum internal post-rewrite: ${msg}`);
      }
    }
    process.exit(0);
    return;
  }

  if (sub === "background-session-distill") {
    const gitRootArg = argv[1];
    const agentArg = argv[2];
    const captureArg = argv[3];
    if (!gitRootArg || !agentArg || !captureArg) {
      eprint(
        "quorum internal background-session-distill: expected <git-root> <agent-id> <capture-abs-path>",
      );
      process.exit(1);
      return;
    }
    if (!(ALLOWED_AGENT_IDS as readonly string[]).includes(agentArg)) {
      eprint(`quorum internal background-session-distill: unknown agent ${JSON.stringify(agentArg)}`);
      process.exit(1);
      return;
    }
    let merged;
    try {
      merged = loadMergedConfig(gitRootArg);
    } catch (e) {
      if (e instanceof ConfigError) {
        eprint(`quorum internal background-session-distill: ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
    const agent = agentArg as AgentId;
    const captureAbs = resolve(captureArg);
    try {
      const r = await distillCommitOrPending(gitRootArg, agent, captureAbs, merged);
      process.exit(r.ok ? 0 : 1);
    } catch (e) {
      if (e instanceof ShadowPushFailure) {
        eprint(`quorum internal background-session-distill: ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
    return;
  }

  const agentSessionSubcommands: Record<string, AgentId> = {
    "claude-session-end": "claude-code",
    "cursor-session-end": "cursor",
    "gemini-session-end": "gemini-cli",
    "opencode-session-end": "opencode",
    "codex-session-end": "codex",
  };
  if (sub && agentSessionSubcommands[sub]) {
    const agent = agentSessionSubcommands[sub];
    let merged;
    try {
      merged = loadMergedConfig(gitRoot);
    } catch (e) {
      if (e instanceof ConfigError) {
        eprint(`quorum internal ${sub}: ${e.message}`);
        process.exit(0);
      }
      throw e;
    }
    let stdinText = "";
    try {
      stdinText = readFileSync(0, "utf-8");
    } catch {
      stdinText = "";
    }
    try {
      runSessionEndHookForAgent(gitRoot, merged, stdinText, agent);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      eprint(`quorum internal ${sub}: ${msg}`);
    }
    process.exit(0);
    return;
  }

  eprint(`quorum internal: unknown subcommand ${JSON.stringify(sub ?? "")}`);
  process.exit(1);
}
