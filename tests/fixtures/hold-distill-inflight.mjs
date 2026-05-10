/**
 * Child process: register distill inflight for gitRoot, sleep ms, unregister, exit 0.
 * Usage: node hold-distill-inflight.mjs <git-root> <sleep-ms>
 */
import { registerDistillInflight, unregisterDistillInflight } from "../../dist/sessions/distill-inflight.js";

const gitRoot = process.argv[2];
const ms = Number(process.argv[3] ?? 500);
if (!gitRoot) {
  process.stderr.write("hold-distill-inflight: missing git-root\n");
  process.exit(1);
}
registerDistillInflight(gitRoot);
setTimeout(() => {
  unregisterDistillInflight(gitRoot);
  process.exit(0);
}, ms);
