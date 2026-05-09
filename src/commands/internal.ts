import { readFileSync } from "node:fs";
import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import { ShadowPushFailure } from "../git/shadow-push.js";
import { runPostRewriteFromStdin } from "../reconcile/run.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export function runInternal(gitRoot: string, argv: string[]): void {
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

  eprint(`quorum internal: unknown subcommand ${JSON.stringify(sub ?? "")}`);
  process.exit(1);
}
