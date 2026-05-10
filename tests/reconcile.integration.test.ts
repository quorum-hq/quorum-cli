import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readShadowBranchTip } from "../src/git/shadow-branch.js";
import { QUORUM_HOOK_MARKER } from "../src/git/hooks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const cliEntry = join(projectRoot, "dist/cli.js");
const distillStub = join(projectRoot, "tests/fixtures/distill-stub.mjs");
const rollupStub = join(projectRoot, "tests/fixtures/rollup-distill-stub.mjs");

function freshGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorum-reconcile-"));
  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Quorum Test"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function setInstallGitRewriteHook(dir: string, value: boolean): void {
  const cfgPath = join(dir, ".quorum/config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf-8")) as Record<string, unknown>;
  cfg.install_git_rewrite_hook = value;
  writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf-8");
}

function runQuorumCapture(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
  input?: string,
): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: input !== undefined ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv },
    input: input ?? undefined,
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    status: r.status ?? 1,
  };
}

function showShadowJsonAt(gitRoot: string, shadow: string, path: string): string {
  const r = spawnSync("git", ["show", `${shadow}:${path}`], {
    cwd: gitRoot,
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    throw new Error(r.stderr ?? "git show failed");
  }
  return r.stdout ?? "";
}

function shadowJsonPaths(gitRoot: string, shadow: string): string[] {
  const r = spawnSync("git", ["ls-tree", "-r", "--name-only", shadow], {
    cwd: gitRoot,
    encoding: "utf-8",
  });
  return (r.stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l.endsWith(".json"));
}

describe("quorum reconcile / post-rewrite / brief linkage", () => {
  it("reconcile --landing and --checkpoint writes a rewrite manifest on the shadow branch", () => {
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

    const r = spawnSync("git", ["ls-tree", "-r", "--name-only", "quorum/context/v1"], {
      cwd: dir,
      encoding: "utf-8",
    });
    const sessionJson = (r.stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".json") && !l.startsWith("rewrite/"));
    expect(sessionJson.length).toBe(1);
    const stem = sessionJson[0].replace(/\.json$/, "");

    const landing =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";
    const rec = runQuorumCapture(dir, ["reconcile", "--landing", landing, "--checkpoint", stem]);
    expect(rec.status).toBe(0);

    const manifestPath = `rewrite/${landing}.json`;
    const raw = showShadowJsonAt(dir, "quorum/context/v1", manifestPath);
    const parsed = JSON.parse(raw) as { kind: string; landing_commit_sha: string; absorbed_checkpoint_ids: string[] };
    expect(parsed.kind).toBe("rewrite");
    expect(parsed.landing_commit_sha).toBe(landing.toLowerCase());
    expect(parsed.absorbed_checkpoint_ids).toContain(stem);
  });

  it("reconcile --rollup writes squash_rollup JSON (sources from manifest) and brief prefers rollup narrative", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const landing =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, "transcript.txt"), "stub", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${landing}\n`, "utf-8");
    const chk = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(chk.status).toBe(0);

    const r = spawnSync("git", ["ls-tree", "-r", "--name-only", "quorum/context/v1"], {
      cwd: dir,
      encoding: "utf-8",
    });
    const sessionRel =
      (r.stdout ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.endsWith(".json") && !l.startsWith("rewrite/"))[0] ?? "";
    expect(sessionRel.length).toBeGreaterThan(0);
    const stem = sessionRel.replace(/\.json$/, "");
    const blobBefore =
      spawnSync("git", ["rev-parse", `quorum/context/v1:${sessionRel}`], {
        cwd: dir,
        encoding: "utf-8",
      }).stdout?.trim() ?? "";

    writeFileSync(join(dir, ".quorum-rollup-test-landing"), `${landing}\n`, "utf-8");
    writeFileSync(join(dir, "rollup.txt"), "rollup transcript\n", "utf-8");

    const rec = runQuorumCapture(
      dir,
      [
        "reconcile",
        "--landing",
        landing,
        "--checkpoint",
        stem,
        "--rollup",
        "--agent",
        "claude-code",
        "--rollup-transcript",
        "rollup.txt",
      ],
      { QUORUM_ROLLUP_DISTILL_WRAPPER: rollupStub },
    );
    expect(rec.status).toBe(0);

    const rollupPaths = shadowJsonPaths(dir, "quorum/context/v1").filter((p) => p.startsWith("rollup-"));
    expect(rollupPaths.length).toBe(1);
    const rollupRaw = showShadowJsonAt(dir, "quorum/context/v1", rollupPaths[0]);
    const rollupParsed = JSON.parse(rollupRaw) as {
      kind: string;
      commit_sha: string;
      sources: string[];
    };
    expect(rollupParsed.kind).toBe("squash_rollup");
    expect(rollupParsed.commit_sha).toBe(landing.toLowerCase());
    expect(rollupParsed.sources).toContain(stem);

    const blobAfter =
      spawnSync("git", ["rev-parse", `quorum/context/v1:${sessionRel}`], {
        cwd: dir,
        encoding: "utf-8",
      }).stdout?.trim() ?? "";
    expect(blobAfter).toBe(blobBefore);

    const brief = runQuorumCapture(dir, ["brief", "README.md"]);
    expect(brief.status).toBe(0);
    expect(brief.stdout).toContain("dec-rollup-stub");
    expect(brief.stdout).not.toContain("dec-fixture-1");
  });

  it("after amend without reconcile, brief explains checkpoints are not reachable for HEAD", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const headBefore =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    // Prevent post-rewrite from auto-writing a manifest when `quorum` is on PATH (we want the no-manifest path).
    runQuorumCapture(dir, ["disable"]);
    writeFileSync(join(dir, "transcript.txt"), "stub", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${headBefore}\n`, "utf-8");
    const chk = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(chk.status).toBe(0);

    writeFileSync(join(dir, "README.md"), "# t\n\namended\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    const amend = spawnSync("git", ["commit", "--amend", "--no-edit"], { cwd: dir, stdio: "ignore" });
    expect(amend.status).toBe(0);
    const headAfter =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";
    expect(headAfter.toLowerCase()).not.toBe(headBefore.toLowerCase());

    const brief = runQuorumCapture(dir, ["brief", "README.md"]);
    expect(brief.status).toBe(0);
    expect(brief.stdout).toContain("No prior context for the current HEAD");
    expect(brief.stdout).toContain("reachable Quorum checkpoints");
    expect(brief.stdout).toContain("reconcile");
  });

  it("after amend, internal post-rewrite stdin records a manifest so brief still surfaces pre-amend decisions", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const headBefore =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, "transcript.txt"), "stub", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${headBefore}\n`, "utf-8");
    const chk = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(chk.status).toBe(0);

    writeFileSync(join(dir, "README.md"), "# t\n\namended\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    const amend = spawnSync("git", ["commit", "--amend", "--no-edit"], { cwd: dir, stdio: "ignore" });
    expect(amend.status).toBe(0);
    const headAfter =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";
    expect(headAfter.toLowerCase()).not.toBe(headBefore.toLowerCase());

    const internal = runQuorumCapture(
      dir,
      ["internal", "post-rewrite", "amend"],
      {},
      `${headBefore} ${headAfter}\n`,
    );
    expect(internal.status).toBe(0);

    const manifestPath = `rewrite/${headAfter.toLowerCase()}.json`;
    const raw = showShadowJsonAt(dir, "quorum/context/v1", manifestPath);
    const parsed = JSON.parse(raw) as { kind: string; absorbed_checkpoint_ids: string[] };
    expect(parsed.kind).toBe("rewrite");
    expect(parsed.absorbed_checkpoint_ids.length).toBeGreaterThan(0);

    const brief = runQuorumCapture(dir, ["brief", "README.md"]);
    expect(brief.status).toBe(0);
    expect(brief.stdout).toContain("dec-fixture-1");
  });

  it("reconcile --landing and --pr absorbs every session checkpoint tagged with that PR number", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    const prStub = join(dir, "distill-pr.mjs");
    writeFileSync(
      prStub,
      `#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
const agent = process.argv[2];
const transcriptPath = process.argv[3];
function readHeadSha() {
  let d = dirname(transcriptPath);
  for (;;) {
    const c = join(d, ".quorum-checkpoint-test-head");
    if (existsSync(c)) return readFileSync(c, "utf-8").trim();
    const p = dirname(d);
    if (p === d) throw new Error("no head file");
    d = p;
  }
}
const h = readHeadSha();
const checkpoint = {
  kind: "session",
  session_id: "550e8400-e29b-41d4-a716-446655440001",
  created_at: "2026-05-09T12:00:00.000Z",
  agent,
  pr_number: 77,
  commit_sha: h,
  intent: "pr fixture",
  decisions: [{
    id: "dec-pr-1",
    topic: "PR",
    conclusion: "linked",
    rationale: "test",
    canonical: false,
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

    writeFileSync(join(dir, "transcript.txt"), "stub", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");
    const chk = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: prStub,
    });
    expect(chk.status).toBe(0);

    const sessionFiles = shadowJsonPaths(dir, "quorum/context/v1").filter((p) => !p.startsWith("rewrite/"));
    expect(sessionFiles.length).toBe(1);
    const stem = sessionFiles[0].replace(/\.json$/, "");

    const rec = runQuorumCapture(dir, ["reconcile", "--landing", head, "--pr", "77"]);
    expect(rec.status).toBe(0);
    const manifestPath = `rewrite/${head.toLowerCase()}.json`;
    const raw = showShadowJsonAt(dir, "quorum/context/v1", manifestPath);
    const parsed = JSON.parse(raw) as { pr_number?: number; absorbed_checkpoint_ids: string[] };
    expect(parsed.pr_number).toBe(77);
    expect(parsed.absorbed_checkpoint_ids).toContain(stem);
  });

  it("git rebase squash triggers the same mapping shape internal post-rewrite consumes", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# a\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "c1"], { cwd: dir, stdio: "ignore" });
    const h0 = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    writeFileSync(join(dir, "README.md"), "# a\n\nb\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "c2"], { cwd: dir, stdio: "ignore" });
    const h1 = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, "transcript.txt"), "stub", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${h1}\n`, "utf-8");
    const chk = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(chk.status).toBe(0);

    const seqEditor = join(dir, "seq-edit.sh");
    writeFileSync(
      seqEditor,
      `#!/bin/sh
set -e
cat > "$1" <<'EOF'
pick ${h0} c1
squash ${h1} c2
EOF
`,
      "utf-8",
    );
    spawnSync("chmod", ["+x", seqEditor], { cwd: dir, stdio: "ignore" });

    const squashMsg = join(dir, "squash-msg.sh");
    writeFileSync(
      squashMsg,
      `#!/bin/sh
exit 0
`,
      "utf-8",
    );
    spawnSync("chmod", ["+x", squashMsg], { cwd: dir, stdio: "ignore" });

    const rb = spawnSync("git", ["rebase", "-i", "--root"], {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_SEQUENCE_EDITOR: seqEditor, GIT_EDITOR: squashMsg },
    });
    if (rb.status !== 0) {
      throw new Error(`rebase failed: ${rb.stderr}\n${rb.stdout}`);
    }

    const headSquashed =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";
    expect(headSquashed.toLowerCase()).not.toBe(h1.toLowerCase());

    const internal = runQuorumCapture(
      dir,
      ["internal", "post-rewrite", "rebase"],
      {},
      `${h0} ${headSquashed}\n${h1} ${headSquashed}\n`,
    );
    expect(internal.status).toBe(0);

    const brief = runQuorumCapture(dir, ["brief", "README.md"]);
    expect(brief.status).toBe(0);
    expect(brief.stdout).toContain("dec-fixture-1");
  });

  it("disable removes the Quorum hook but leaves rewrite manifests on the shadow branch", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    setInstallGitRewriteHook(dir, true);
    expect(runQuorumCapture(dir, ["install"]).status).toBe(0);
    writeFileSync(join(dir, "transcript.txt"), "stub", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");
    runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });

    const r = spawnSync("git", ["ls-tree", "-r", "--name-only", "quorum/context/v1"], {
      cwd: dir,
      encoding: "utf-8",
    });
    const sessionJson = (r.stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".json") && !l.startsWith("rewrite/"));
    const stem = sessionJson[0].replace(/\.json$/, "");

    runQuorumCapture(dir, ["reconcile", "--landing", head, "--checkpoint", stem]);
    const tipBefore = readShadowBranchTip(dir, "quorum/context/v1");
    const beforeRewrite = shadowJsonPaths(dir, "quorum/context/v1").filter((p) => p.startsWith("rewrite/"));
    expect(beforeRewrite.length).toBe(1);

    const hook = join(dir, ".git/hooks/post-rewrite");
    expect(existsSync(hook)).toBe(true);
    expect(readFileSync(hook, "utf-8")).toContain(QUORUM_HOOK_MARKER);

    const dis = runQuorumCapture(dir, ["disable"]);
    expect(dis.status).toBe(0);
    expect(existsSync(hook)).toBe(false);
    expect(readShadowBranchTip(dir, "quorum/context/v1")).toBe(tipBefore);
    const afterRewrite = shadowJsonPaths(dir, "quorum/context/v1").filter((p) => p.startsWith("rewrite/"));
    expect(afterRewrite).toEqual(beforeRewrite);
  });
});
