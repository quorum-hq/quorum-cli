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
import { runLog, runShow } from "./commands/log-show.js";
import { runRetry } from "./commands/retry.js";
import { runStatus } from "./commands/status.js";
import { ALLOWED_AGENT_IDS } from "./config/constants.js";
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

type CommandHelpRow = {
  name: string;
  blurb: string;
  /** Extra lines (flags, positionals); printed under the blurb, same column. */
  detail?: readonly string[];
};

const COMMAND_HELP: readonly CommandHelpRow[] = [
  { name: "help", blurb: "Show this list. Same as -h / --help on the bare CLI." },
  { name: "version", blurb: "Print the installed CLI version." },
  { name: "init", blurb: "Create `.quorum/` config, shadow branch, and git/agent hooks." },
  { name: "install", blurb: "Install hooks when the repo already has committed Quorum config." },
  { name: "disable", blurb: "Remove Quorum git and agent hooks (does not delete shadow data)." },
  { name: "status", blurb: "Report whether Quorum hooks are installed." },
  {
    name: "checkpoint",
    blurb: "Distill a session transcript into a checkpoint on the shadow branch.",
    detail: [
      "Required: --agent <id> (" + ALLOWED_AGENT_IDS.join(", ") + ").",
      "One positional: transcript file path (after flags).",
    ],
  },
  { name: "retry", blurb: "Retry distillation for the latest pending session capture." },
  {
    name: "reconcile",
    blurb: "Write a rewrite manifest on the shadow branch for a landing commit; optional rollup distillation.",
    detail: [
      "Required: --landing <40-hex-sha>.",
      "At least one of: --checkpoint <id> (repeatable), --pr <positive-int>.",
      "With --rollup: also --agent <id> and --rollup-transcript <path> (" + ALLOWED_AGENT_IDS.join(", ") + ").",
    ],
  },
  {
    name: "internal",
    blurb: "Hook entrypoints only; not for normal interactive use.",
    detail: [
      "Subcommands: post-rewrite (stdin), background-session-distill <git-root> <agent> <capture-path>,",
      "claude-session-end | cursor-session-end | gemini-session-end | opencode-session-end | codex-session-end.",
    ],
  },
  {
    name: "brief",
    blurb: "Assemble a prompt brief from distilled checkpoints for paths vs HEAD.",
    detail: ["Optional: --no-wait, --tokens <N>. Remaining args: repo-relative paths (default: tracked diff vs HEAD)."],
  },
  {
    name: "pin",
    blurb: "Pin a decision to a checkpoint on the shadow branch.",
    detail: ["Positionals: <checkpoint-id> <decision-id> (checkpoint id matches shadow JSON stem or record id)."],
  },
  {
    name: "unpin",
    blurb: "Remove a decision pin from a checkpoint.",
    detail: ["Positionals: <checkpoint-id> <decision-id>."],
  },
  {
    name: "pins",
    blurb: "List checkpoints and their pinned decisions from the shadow branch.",
    detail: ["Optional: --no-wait."],
  },
  {
    name: "log",
    blurb: "List shadow artifacts (checkpoints, manifests), optionally under a path prefix.",
    detail: ["Optional: --no-wait, then optional path-prefix filter."],
  },
  {
    name: "show",
    blurb: "Print one shadow checkpoint or rewrite manifest.",
    detail: [
      "Optional: --json or -j for indented JSON.",
      "One positional: <id> — checkpoint id, shadow filename stem, or rewrite landing SHA (40 hex; prefix match if unambiguous).",
    ],
  },
];

function formatCommandHelp(): string {
  const width = COMMAND_HELP.reduce((m, r) => Math.max(m, r.name.length), 0);
  const gap = "  ";
  return COMMAND_HELP.map((r) => {
    const nameCol = `${gap}${r.name.padEnd(width)}  `;
    let block = `${nameCol}${r.blurb}`;
    if (r.detail?.length) {
      const indent = `${gap}${" ".repeat(width)}  `;
      for (const line of r.detail) {
        block += `\n${indent}${line}`;
      }
    }
    return block;
  }).join("\n");
}

function usage(): void {
  eprint("quorum: no command given.\n" + "  Run `quorum --help` for commands, flags, and arguments.");
}

function printHelp(): void {
  process.stdout.write("quorum\n\nCommands:\n" + formatCommandHelp() + "\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const first = argv[0];

  if (first === "version") {
    process.stdout.write(`${readOwnVersion()}\n`);
    process.exit(0);
  }

  if (first === "-h" || first === "--help") {
    printHelp();
    process.exit(0);
  }

  if (first === "help") {
    if (argv.length > 1) {
      eprint(`quorum: unknown help topic "${argv[1]}".`);
      process.exit(1);
    }
    printHelp();
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
      case "status":
        runStatus(gitRoot);
        process.exit(0);
      case "checkpoint":
        await runCheckpoint(gitRoot, argv.slice(1));
        return;
      case "retry":
        await runRetry(gitRoot);
        return;
      case "reconcile":
        await runReconcile(gitRoot, argv.slice(1));
        return;
      case "internal":
        await runInternal(gitRoot, argv.slice(1));
        return;
      case "brief":
        await runBrief(gitRoot, argv.slice(1));
        return;
      case "pin":
        runPin(gitRoot, argv.slice(1));
        return;
      case "unpin":
        runUnpin(gitRoot, argv.slice(1));
        return;
      case "pins":
        await runPinsList(gitRoot, argv.slice(1));
        return;
      case "log":
        await runLog(gitRoot, argv.slice(1));
        process.exit(0);
      case "show":
        runShow(gitRoot, argv.slice(1));
        process.exit(0);
      default:
        eprint(
          `quorum: unknown command "${first}".\n` + "  Run `quorum --help` for commands, flags, and arguments.",
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
