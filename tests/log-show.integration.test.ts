import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSessionCheckpointRecord } from "../src/checkpoint/session.js";
import {
  commitCheckpointJsonOnShadowBranch,
  upsertCheckpointJsonOnShadowBranch,
} from "../src/git/shadow-commit.js";
import { serializeRewriteManifest, type RewriteManifestV1 } from "../src/reconcile/manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const cliEntry = join(projectRoot, "dist/cli.js");

function freshGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorum-logshow-"));
  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Quorum Test"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function runQuorumCapture(
  cwd: string,
  args: string[],
): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    status: r.status ?? 1,
  };
}

function sessionBody(
  fileStem: string,
  createdAt: string,
  intent: string,
  filesTouched: string[],
  commitSha: string,
): string {
  const raw = {
    kind: "session" as const,
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    created_at: createdAt,
    agent: "claude-code" as const,
    commit_sha: commitSha,
    intent,
    decisions: [
      {
        id: "dec-1",
        topic: "T",
        conclusion: "C",
        rationale: "R",
        canonical: false,
      },
    ],
    files_touched: filesTouched,
    open_questions: [] as string[],
  };
  const cp = parseSessionCheckpointRecord(raw, fileStem);
  return `${JSON.stringify(cp, null, 2)}\n`;
}

describe("quorum log / quorum show", () => {
  it("lists shadow checkpoints newest-first by created_at (not git commit order)", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);

    const shadow = "quorum/context/v1";
    // Commit newer created_at first, older second — display is newest-first by checkpoint time.
    commitCheckpointJsonOnShadowBranch(
      dir,
      shadow,
      "2026-06-02-second.json",
      sessionBody(
        "2026-06-02-second",
        "2026-06-02T12:00:00.000Z",
        "Newer session",
        ["README.md"],
        head,
      ),
    );
    commitCheckpointJsonOnShadowBranch(
      dir,
      shadow,
      "2026-06-01-first.json",
      sessionBody(
        "2026-06-01-first",
        "2026-06-01T12:00:00.000Z",
        "Older session",
        ["src/auth/x.ts"],
        head,
      ),
    );

    const r = runQuorumCapture(dir, ["log"]);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("Quorum shadow log");
    expect(r.stdout).toContain("2 entries");
    expect(r.stdout).toContain("newest first");
    const older = r.stdout.indexOf("2026-06-01-first");
    const newer = r.stdout.indexOf("2026-06-02-second");
    expect(older).toBeGreaterThanOrEqual(0);
    expect(newer).toBeGreaterThanOrEqual(0);
    expect(newer).toBeLessThan(older);
    expect(r.stdout).toContain("Older session");
    expect(r.stdout).toContain("Newer session");
  });

  it("log path prefix keeps only checkpoints touching that subtree", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    const shadow = "quorum/context/v1";

    commitCheckpointJsonOnShadowBranch(
      dir,
      shadow,
      "2026-06-01-a.json",
      sessionBody("2026-06-01-a", "2026-06-01T10:00:00.000Z", "Auth work", ["src/auth/login.ts"], head),
    );
    commitCheckpointJsonOnShadowBranch(
      dir,
      shadow,
      "2026-06-01-b.json",
      sessionBody("2026-06-01-b", "2026-06-01T11:00:00.000Z", "Other", ["lib/foo.ts"], head),
    );

    const r = runQuorumCapture(dir, ["log", "src/auth/"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Filtered to paths under: src/auth/");
    expect(r.stdout).toContain("2026-06-01-a");
    expect(r.stdout).toContain("Auth work");
    expect(r.stdout).not.toContain("2026-06-01-b");
  });

  it("show defaults to human layout; --json prints indented JSON; ambiguous id fails with candidates", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    const shadow = "quorum/context/v1";
    commitCheckpointJsonOnShadowBranch(
      dir,
      shadow,
      "2026-06-01-a.json",
      sessionBody("2026-06-01-a", "2026-06-01T10:00:00.000Z", "Auth work", ["src/auth/login.ts"], head),
    );
    commitCheckpointJsonOnShadowBranch(
      dir,
      shadow,
      "2026-06-01-b.json",
      sessionBody("2026-06-01-b", "2026-06-01T11:00:00.000Z", "Other", ["lib/foo.ts"], head),
    );

    const human = runQuorumCapture(dir, ["show", "2026-06-01-a"]);
    expect(human.status).toBe(0);
    expect(human.stdout).toContain("Checkpoint");
    expect(human.stdout).toContain("kind");
    expect(human.stdout).toContain("2026-06-01-a");
    expect(human.stdout).toContain("Auth work");
    expect(human.stdout).toContain("Decisions");

    const show = runQuorumCapture(dir, ["show", "2026-06-01-a", "--json"]);
    expect(show.status).toBe(0);
    expect(show.stdout).toContain('"kind": "session"');
    expect(show.stdout).toContain('"id": "2026-06-01-a"');

    const usage = runQuorumCapture(dir, ["show"]);
    expect(usage.status).toBe(1);
    expect(usage.stderr).toContain("Usage: quorum show");

    const amb = runQuorumCapture(dir, ["show", "2026-06-01"]);
    expect(amb.status).toBe(1);
    expect(amb.stderr).toContain("ambiguous");
    expect(amb.stderr).toContain("2026-06-01-a");
    expect(amb.stderr).toContain("2026-06-01-b");
  });

  it("show resolves rewrite manifest by landing commit sha", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    const shadow = "quorum/context/v1";
    commitCheckpointJsonOnShadowBranch(
      dir,
      shadow,
      "2026-06-01-a.json",
      sessionBody("2026-06-01-a", "2026-06-01T10:00:00.000Z", "One", ["a.ts"], head),
    );

    const manifest: RewriteManifestV1 = {
      kind: "rewrite",
      version: 1,
      landing_commit_sha: head.toLowerCase(),
      absorbed_checkpoint_ids: ["2026-06-01-a"],
    };
    const mPath = `rewrite/${head.toLowerCase()}.json`;
    upsertCheckpointJsonOnShadowBranch(dir, shadow, mPath, serializeRewriteManifest(manifest));

    const r = runQuorumCapture(dir, ["show", head, "--json"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"kind": "rewrite"');
    expect(r.stdout).toContain(`"landing_commit_sha": "${head.toLowerCase()}"`);
  });
});
