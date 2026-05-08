import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultCommittedConfigSnapshot, loadMergedConfig } from "../config/load.js";
import { ConfigError, parseAndValidateCommittedConfig, parseAndValidateLocalOverrides } from "../config/validate.js";
import { ensureQuorumGitignoreBlock } from "../git/gitignore.js";
import { installPostRewriteStub } from "../git/hooks.js";
import { ensureShadowBranch } from "../git/shadow-branch.js";
import { quorumConfigPath, quorumDir, quorumLocalPath } from "../paths.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

function printSecurityNotice(): void {
  eprint(
    "quorum: security — v0.1 does not redact secrets from transcripts before distillation.\n" +
      "  Treat session captures like any other secret-bearing log; review `.quorum/` and agent CLI paths.",
  );
}

function stableStringifyConfig(obj: ReturnType<typeof defaultCommittedConfigSnapshot>): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export function runInit(gitRoot: string): void {
  mkdirSync(quorumDir(gitRoot), { recursive: true });
  const cPath = quorumConfigPath(gitRoot);
  const lPath = quorumLocalPath(gitRoot);

  if (!existsSync(cPath)) {
    writeFileSync(cPath, stableStringifyConfig(defaultCommittedConfigSnapshot()), "utf-8");
  } else {
    try {
      parseAndValidateCommittedConfig(cPath, JSON.parse(readFileSync(cPath, "utf-8")));
    } catch (e) {
      if (e instanceof ConfigError) {
        eprint(`quorum init: ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
  }

  if (!existsSync(lPath)) {
    writeFileSync(lPath, "{}\n", "utf-8");
  } else {
    try {
      parseAndValidateLocalOverrides(lPath, JSON.parse(readFileSync(lPath, "utf-8")));
    } catch (e) {
      if (e instanceof ConfigError) {
        eprint(`quorum init: ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
  }

  ensureQuorumGitignoreBlock(gitRoot);

  const merged = loadMergedConfig(gitRoot);
  ensureShadowBranch(gitRoot, merged.shadow_branch);

  if (merged.install_git_rewrite_hook) {
    const r = installPostRewriteStub(gitRoot);
    if (r.skipped && r.reason) {
      eprint(`quorum init: ${r.reason}`);
    }
  }

  eprint(`quorum: initialized in ${join(gitRoot, ".quorum")}`);
  printSecurityNotice();
}
