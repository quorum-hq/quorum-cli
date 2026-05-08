import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const cliEntry = join(projectRoot, "dist/cli.js");
const distillStub = join(projectRoot, "tests/fixtures/distill-stub.mjs");

function freshGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorum-brief-"));
  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Quorum Test"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function runQuorumCapture(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv },
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    status: r.status ?? 1,
  };
}

function shadowJsonFiles(gitRoot: string, shadow: string): string[] {
  const r = spawnSync("git", ["ls-tree", "-r", "--name-only", shadow], {
    cwd: gitRoot,
    encoding: "utf-8",
  });
  return (r.stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".json"));
}

describe("quorum brief / pin / pins", () => {
  it("brief with empty shadow store reports no prior context yet", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    runQuorumCapture(dir, ["init"]);
    expect(existsSync(join(dir, ".quorum", "config.json"))).toBe(true);

    const r = runQuorumCapture(dir, ["brief", "README.md"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("No prior context in the shadow store yet");
  });

  it("brief with no path uses tracked git diff vs HEAD (excludes untracked)", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, "transcript.txt"), "stub", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");
    const chk = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(chk.status).toBe(0);

    writeFileSync(join(dir, "README.md"), "# t\n\nmore\n", "utf-8");
    writeFileSync(join(dir, "untracked-only.txt"), "u\n", "utf-8");

    const r = runQuorumCapture(dir, ["brief"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("dec-fixture-1");
    expect(r.stdout).toContain("[context]");
  });

  it("pin / unpin / pins round-trip and brief shows canonical section when pinned", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, "transcript.txt"), "stub", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");
    const chk = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(chk.status).toBe(0);

    const jsonFiles = shadowJsonFiles(dir, "quorum/context/v1");
    expect(jsonFiles.length).toBe(1);
    const stem = jsonFiles[0].replace(/\.json$/, "");

    const pin = runQuorumCapture(dir, ["pin", stem, "dec-fixture-1"]);
    expect(pin.status).toBe(0);

    const pins = runQuorumCapture(dir, ["pins"]);
    expect(pins.status).toBe(0);
    expect(pins.stdout).toContain("dec-fixture-1");
    expect(pins.stdout).toContain("README.md");

    const briefPinned = runQuorumCapture(dir, ["brief", "README.md"]);
    expect(briefPinned.status).toBe(0);
    expect(briefPinned.stdout).toContain("[canonical]");
    expect(briefPinned.stdout).toContain("dec-fixture-1");

    const un = runQuorumCapture(dir, ["unpin", stem, "dec-fixture-1"]);
    expect(un.status).toBe(0);

    const briefUn = runQuorumCapture(dir, ["brief", "README.md"]);
    expect(briefUn.status).toBe(0);
    expect(briefUn.stdout).not.toContain("[canonical]");
    expect(briefUn.stdout).toContain("[context]");
  });

  it("brief --tokens overrides default budget and can surface overflow on stderr for large pinned text", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, "transcript.txt"), "stub", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");
    const chk = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(chk.status).toBe(0);

    const jsonFiles = shadowJsonFiles(dir, "quorum/context/v1");
    const stem = jsonFiles[0].replace(/\.json$/, "");

    runQuorumCapture(dir, ["pin", stem, "dec-fixture-1"]);

    const customStub = join(dir, "big-rationale.mjs");
    const big = "y".repeat(500);
    writeFileSync(
      customStub,
      `#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
const transcriptPath = process.argv[3];
function readHeadSha() {
  let dir = dirname(transcriptPath);
  for (;;) {
    const candidate = join(dir, ".quorum-checkpoint-test-head");
    if (existsSync(candidate)) return readFileSync(candidate, "utf-8").trim();
    const parent = dirname(dir);
    if (parent === dir) throw new Error("no head file");
    dir = parent;
  }
}
const head = readHeadSha();
const checkpoint = {
  kind: "session",
  session_id: "550e8400-e29b-41d4-a716-446655440000",
  created_at: "2026-05-09T12:00:00.000Z",
  agent: process.argv[2],
  commit_sha: head,
  intent: "big",
  decisions: [{
    id: "dec-big",
    topic: "Big",
    conclusion: "c",
    rationale: ${JSON.stringify(big)},
    canonical: true,
  }],
  files_touched: ["README.md"],
  open_questions: [],
};
console.log("<<QUORUM_JSON>>");
console.log(JSON.stringify(checkpoint));
console.log("<<END_QUORUM_JSON>>");
`,
      "utf-8",
    );

    writeFileSync(join(dir, "transcript2.txt"), "t2", "utf-8");
    const chk2 = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript2.txt"], {
      QUORUM_DISTILL_WRAPPER: customStub,
    });
    expect(chk2.status).toBe(0);

    const jsonAfter = shadowJsonFiles(dir, "quorum/context/v1");
    expect(jsonAfter.length).toBeGreaterThanOrEqual(2);

    const brief = runQuorumCapture(dir, ["brief", "--tokens", "5", "README.md"]);
    expect(brief.status).toBe(0);
    expect(brief.stderr).toContain("nominal token budget");
    expect(brief.stdout).toContain("[canonical]");
    expect(brief.stdout).toContain("dec-big");
  });
});
