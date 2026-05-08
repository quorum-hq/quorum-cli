import { spawn } from "node:child_process";

export type DistillSpawnResult =
  | { ok: true; status: number; stdout: string; stderr: string }
  | { ok: false; reason: "timeout" | "nonzero_exit" | "spawn_error"; stdout: string; stderr: string; error?: string };

function drain(stream: NodeJS.ReadableStream | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!stream) {
      resolve(Buffer.alloc(0));
      return;
    }
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * Run distiller subprocess with hard timeout: SIGTERM at limit, SIGKILL after grace.
 */
export async function spawnDistillerWithTimeout(opts: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  killGraceMs?: number;
}): Promise<DistillSpawnResult> {
  const killGraceMs = opts.killGraceMs ?? 2000;
  let child;
  try {
    child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: "spawn_error",
      stdout: "",
      stderr: "",
      error: msg,
    };
  }

  const stdoutP = drain(child.stdout);
  const stderrP = drain(child.stderr);

  let timedOut = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const hardTimer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    killTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, killGraceMs);
  }, opts.timeoutMs);

  const exitP = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(hardTimer);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      resolve(code ?? 1);
    });
  });

  try {
    const code = await exitP;
    const stdout = (await stdoutP).toString("utf-8");
    const stderr = (await stderrP).toString("utf-8");
    if (timedOut) {
      return { ok: false, reason: "timeout", stdout, stderr };
    }
    if (code !== 0) {
      return { ok: false, reason: "nonzero_exit", stdout, stderr };
    }
    return { ok: true, status: code, stdout, stderr };
  } catch (e) {
    clearTimeout(hardTimer);
    if (killTimer) {
      clearTimeout(killTimer);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: "spawn_error",
      stdout: "",
      stderr: "",
      error: msg,
    };
  }
}
