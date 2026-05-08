import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMergedConfig } from "../config/load.js";
import { ConfigError, parseAndValidateLocalOverrides } from "../config/validate.js";
import { ensureQuorumGitignoreBlock } from "../git/gitignore.js";
import { installPostRewriteStub } from "../git/hooks.js";
import { quorumConfigPath, quorumDir, quorumLocalPath } from "../paths.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export function runInstall(gitRoot: string): void {
  const cPath = quorumConfigPath(gitRoot);
  if (!existsSync(cPath)) {
    eprint(
      "quorum install: `.quorum/config.json` not found.\n" +
        "  Clone the repository that already has Quorum configured, or run `quorum init` once in the repo root.",
    );
    process.exit(1);
  }

  mkdirSync(quorumDir(gitRoot), { recursive: true });
  const lPath = quorumLocalPath(gitRoot);
  if (!existsSync(lPath)) {
    writeFileSync(lPath, "{}\n", "utf-8");
  } else {
    try {
      parseAndValidateLocalOverrides(lPath, JSON.parse(readFileSync(lPath, "utf-8")));
    } catch (e) {
      if (e instanceof ConfigError) {
        eprint(`quorum install: ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
  }

  ensureQuorumGitignoreBlock(gitRoot);

  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum install: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  if (merged.install_git_rewrite_hook) {
    const r = installPostRewriteStub(gitRoot);
    if (r.skipped && r.reason) {
      eprint(`quorum install: ${r.reason}`);
    }
  }

  eprint(`quorum: install complete for ${join(gitRoot, ".quorum")}`);
}
