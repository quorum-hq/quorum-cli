import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import { runReconcileCli } from "../reconcile/run.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export async function runReconcile(gitRoot: string, argv: string[]): Promise<void> {
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
    await runReconcileCli(gitRoot, merged, argv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    eprint(`quorum reconcile: ${msg}`);
    eprint(
      "  Usage: quorum reconcile --landing <sha> [--checkpoint <id> ...] [--pr <n>] [--rollup --agent <id> --rollup-transcript <path>]\n" +
        "    At least one of --checkpoint or --pr is required.\n" +
        "    With --rollup, run rollup distillation (same agent CLI strategy as checkpoint; CI may set QUORUM_ROLLUP_DISTILL_WRAPPER).",
    );
    process.exit(1);
  }
  process.exit(0);
}
