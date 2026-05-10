import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const cliEntry = join(projectRoot, "dist/cli.js");

function pkgVersion(): string {
  const raw = readFileSync(join(projectRoot, "package.json"), "utf-8");
  return (JSON.parse(raw) as { version: string }).version;
}

function nonGitCwd(): string {
  return mkdtempSync(join(tmpdir(), "quorum-cli-no-git-"));
}

type ExecError = Error & { status: number; stderr: string };

describe("quorum CLI", () => {
  it("prints version on stdout and exits 0 when run as `quorum version` inside a git repo", () => {
    const stdout = execFileSync(process.execPath, [cliEntry, "version"], {
      encoding: "utf-8",
      cwd: projectRoot,
    });
    expect(stdout.trim()).toBe(pkgVersion());
  });

  it("prints version on stdout from a non-git directory (install smoke check)", () => {
    const cwd = nonGitCwd();
    const stdout = execFileSync(process.execPath, [cliEntry, "version"], {
      encoding: "utf-8",
      cwd,
    });
    expect(stdout.trim()).toBe(pkgVersion());
  });

  it("fails fast with a clear message when run outside a git work tree", () => {
    const cwd = nonGitCwd();
    let err: ExecError | undefined;
    try {
      execFileSync(process.execPath, [cliEntry], {
        encoding: "utf-8",
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      err = e as ExecError;
    }
    expect(err).toBeDefined();
    expect(err!.status).toBe(1);
    expect(err!.stderr).toContain("not inside a git working tree");
    expect(err!.stderr).toContain("git init");
  });

  it("prints help on stdout and exits 0 for --help outside a git work tree", () => {
    const cwd = nonGitCwd();
    const stdout = execFileSync(process.execPath, [cliEntry, "--help"], {
      encoding: "utf-8",
      cwd,
    });
    expect(stdout).toContain("quorum");
    expect(stdout).toContain("quorum version");
    expect(stdout).toContain("quorum init");
  });

  it("prints help on stdout and exits 0 for -h outside a git work tree", () => {
    const cwd = nonGitCwd();
    const stdout = execFileSync(process.execPath, [cliEntry, "-h"], {
      encoding: "utf-8",
      cwd,
    });
    expect(stdout).toContain("quorum version");
  });

  it("prints help on stdout and exits 0 for help outside a git work tree", () => {
    const cwd = nonGitCwd();
    const stdout = execFileSync(process.execPath, [cliEntry, "help"], {
      encoding: "utf-8",
      cwd,
    });
    expect(stdout).toContain("quorum version");
  });

  it("rejects help with an extra topic with exit 1", () => {
    const cwd = nonGitCwd();
    let err: ExecError | undefined;
    try {
      execFileSync(process.execPath, [cliEntry, "help", "checkpoint"], {
        encoding: "utf-8",
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      err = e as ExecError;
    }
    expect(err).toBeDefined();
    expect(err!.status).toBe(1);
    expect(err!.stderr).toContain("unknown help topic");
  });
});
