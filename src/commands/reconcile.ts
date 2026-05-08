import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import { runReconcileCli } from "../reconcile/run.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export function runReconcile(gitRoot: string, argv: string[]): void {
  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum reconcile: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
  try {
    runReconcileCli(gitRoot, merged, argv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    eprint(`quorum reconcile: ${msg}`);
    eprint(
      "  Usage: quorum reconcile --landing <sha> [--checkpoint <id> ...] [--pr <n>]\n" +
        "    At least one of --checkpoint or --pr is required.",
    );
    process.exit(1);
  }
  process.exit(0);
}
