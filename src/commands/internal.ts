import { readFileSync } from "node:fs";
import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import { runSessionEndHookForAgent } from "../agent-hooks/session-end.js";
import { ShadowPushFailure } from "../git/shadow-push.js";
import { runPostRewriteFromStdin } from "../reconcile/run.js";
import type { AgentId } from "../config/constants.js";

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
      await runSessionEndHookForAgent(gitRoot, merged, stdinText, agent);
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
