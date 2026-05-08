#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runBrief } from "./commands/brief.js";
import { runCheckpoint } from "./commands/checkpoint.js";
import { runDisable } from "./commands/disable.js";
import { runInit } from "./commands/init.js";
import { runInstall } from "./commands/install.js";
import { runInternal } from "./commands/internal.js";
import { runPin, runPinsList, runUnpin } from "./commands/pins.js";
import { runReconcile } from "./commands/reconcile.js";
import { runRetry } from "./commands/retry.js";
import { ConfigError } from "./config/validate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readOwnVersion(): string {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
  return pkg.version;
}

function resolveGitRoot(cwd: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const root = out.trim();
    return root.length > 0 ? root : null;
  } catch {
    return null;
  }
}

function eprint(msg: string): void {
  const endsWithNewline = msg.endsWith("\n");
  process.stderr.write(endsWithNewline ? msg : `${msg}\n`);
}

function usage(): void {
  eprint(
    "quorum: no command given.\n" +
      "  Try: quorum version\n" +
      "       quorum init\n" +
      "       quorum install\n" +
      "       quorum disable\n" +
      "       quorum checkpoint --agent <id> <transcript-file>\n" +
      "       quorum retry\n" +
      "       quorum reconcile --landing <sha> [--checkpoint <id> ...] [--pr <n>]\n" +
      "       quorum brief [--tokens N] [path...]\n" +
      "       quorum pin <checkpoint-id> <decision-id>\n" +
      "       quorum unpin <checkpoint-id> <decision-id>\n" +
      "       quorum pins",
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const first = argv[0];

  if (first === "version") {
    process.stdout.write(`${readOwnVersion()}\n`);
    process.exit(0);
  }

  const cwd = process.cwd();
  const gitRoot = resolveGitRoot(cwd);
  if (!gitRoot) {
    eprint(
      "quorum: not inside a git working tree.\n" +
        "  Change to a repository directory (or a subfolder of one), or initialize a repo with `git init`, then try again.",
    );
    process.exit(1);
  }

  try {
    if (argv.length === 0) {
      usage();
      process.exit(1);
    }

    switch (first) {
      case "init":
        runInit(gitRoot);
        process.exit(0);
      case "install":
        runInstall(gitRoot);
        process.exit(0);
      case "disable":
        runDisable(gitRoot);
        process.exit(0);
      case "checkpoint":
        await runCheckpoint(gitRoot, argv.slice(1));
        return;
      case "retry":
        await runRetry(gitRoot);
        return;
      case "reconcile":
        runReconcile(gitRoot, argv.slice(1));
        return;
      case "internal":
        runInternal(gitRoot, argv.slice(1));
        return;
      case "brief":
        runBrief(gitRoot, argv.slice(1));
        return;
      case "pin":
        runPin(gitRoot, argv.slice(1));
        return;
      case "unpin":
        runUnpin(gitRoot, argv.slice(1));
        return;
      case "pins":
        runPinsList(gitRoot);
        return;
      default:
        eprint(
          `quorum: unknown command "${first}".\n` +
            "  Try: quorum version | quorum init | quorum checkpoint --agent <id> <file> | quorum retry | quorum brief",
        );
        process.exit(1);
    }
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.stack ?? e.message : String(e);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
