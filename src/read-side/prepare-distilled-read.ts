import { findLatestPendingId } from "../sessions/pending.js";
import {
  clearStaleDistillInflight,
  isDistillInflightActive,
} from "../sessions/distill-inflight.js";

const POLL_MS = 200;
const NON_TTY_HEARTBEAT_MS = 30_000;

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function writeYellowWarningLine(msg: string): void {
  if (process.stderr.isTTY) {
    process.stderr.write(`\x1b[33m${msg}\x1b[0m\n`);
  } else {
    process.stderr.write(`${msg}\n`);
  }
}

/** Strip `--no-wait` from argv (position-independent). */
export function stripNoWaitFlag(argv: string[]): { argv: string[]; noWait: boolean } {
  const out: string[] = [];
  let noWait = false;
  for (const a of argv) {
    if (a === "--no-wait") {
      noWait = true;
    } else {
      out.push(a);
    }
  }
  return { argv: out, noWait };
}

export async function waitUntilDistillInflightClears(gitRoot: string): Promise<void> {
  const tty = process.stderr.isTTY;
  let frameIndex = 0;
  let spinnerInterval: ReturnType<typeof setInterval> | undefined;
  let lastHeartbeat = Date.now();

  if (tty) {
    spinnerInterval = setInterval(() => {
      const f = SPINNER_FRAMES[frameIndex++ % SPINNER_FRAMES.length];
      process.stderr.write(`\r\x1b[33m${f}\x1b[0m Waiting for Quorum distillation...\x1b[K`);
    }, 80);
  } else {
    process.stderr.write("quorum: waiting for Quorum distillation to finish…\n");
  }

  try {
    for (;;) {
      clearStaleDistillInflight(gitRoot);
      if (!isDistillInflightActive(gitRoot)) {
        break;
      }
      if (!tty && Date.now() - lastHeartbeat >= NON_TTY_HEARTBEAT_MS) {
        process.stderr.write("quorum: still waiting for Quorum distillation…\n");
        lastHeartbeat = Date.now();
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } finally {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      process.stderr.write("\r\x1b[K");
    }
  }
}

/**
 * Before reading shadow/distilled artifacts: optionally wait for in-flight distillation,
 * then emit warnings for skipped wait or pending failed captures.
 */
export async function prepareForDistilledReads(gitRoot: string, opts: { noWait: boolean }): Promise<void> {
  clearStaleDistillInflight(gitRoot);
  const inflightBefore = isDistillInflightActive(gitRoot);

  if (inflightBefore) {
    if (opts.noWait) {
      writeYellowWarningLine(
        "quorum: warning: Quorum distillation is still in progress. Results may be stale.",
      );
    } else {
      await waitUntilDistillInflightClears(gitRoot);
    }
  }

  clearStaleDistillInflight(gitRoot);

  if (findLatestPendingId(gitRoot)) {
    writeYellowWarningLine(
      "quorum: warning: distillation failed or there are pending capture(s) under .quorum/sessions/pending/. Results may be stale. Run `quorum retry` when ready.",
    );
  }
}
