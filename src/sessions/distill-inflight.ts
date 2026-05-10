import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { quorumSessionsDir } from "../paths.js";

function inflightDir(gitRoot: string): string {
  return join(quorumSessionsDir(gitRoot), "distill-inflight");
}

function pidFilePath(gitRoot: string, pid: number): string {
  return join(inflightDir(gitRoot), `${pid}.json`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EPERM") {
      return true;
    }
    return false;
  }
}

/** Remove marker files for processes that are no longer running. */
export function clearStaleDistillInflight(gitRoot: string): void {
  const dir = inflightDir(gitRoot);
  if (!existsSync(dir)) {
    return;
  }
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile()) {
      continue;
    }
    const m = /^(\d+)\.json$/.exec(ent.name);
    if (!m) {
      continue;
    }
    const pid = Number(m[1]);
    if (!Number.isFinite(pid) || !isProcessAlive(pid)) {
      rmSync(join(dir, ent.name), { force: true });
    }
  }
}

export function registerDistillInflight(gitRoot: string): void {
  mkdirSync(quorumSessionsDir(gitRoot), { recursive: true });
  mkdirSync(inflightDir(gitRoot), { recursive: true });
  const pid = process.pid;
  const body = `${JSON.stringify({ pid, startedAt: new Date().toISOString() }, null, 0)}\n`;
  writeFileSync(pidFilePath(gitRoot, pid), body, "utf-8");
}

export function unregisterDistillInflight(gitRoot: string): void {
  const f = pidFilePath(gitRoot, process.pid);
  if (existsSync(f)) {
    rmSync(f, { force: true });
  }
}

export function isDistillInflightActive(gitRoot: string): boolean {
  clearStaleDistillInflight(gitRoot);
  const dir = inflightDir(gitRoot);
  if (!existsSync(dir)) {
    return false;
  }
  return readdirSync(dir).some((name) => /^\d+\.json$/.test(name));
}
