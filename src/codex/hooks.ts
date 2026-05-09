import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { codexConfigTomlPath, codexHooksPath } from "../paths.js";

export const QUORUM_CODEX_COMMAND = "quorum internal codex-session-end";
const CODEX_HOOK_EVENT = "Stop";

type CodexHooksFile = {
  hooks?: Record<string, unknown>;
  [k: string]: unknown;
};

function readHooksFile(path: string): CodexHooksFile {
  if (!existsSync(path)) {
    return {};
  }
  const raw = readFileSync(path, "utf-8").trim();
  if (raw.length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected a JSON object");
  }
  return parsed as CodexHooksFile;
}

function ensureHooksArray(root: CodexHooksFile, eventName: string): unknown[] {
  if (!root.hooks || typeof root.hooks !== "object" || Array.isArray(root.hooks)) {
    root.hooks = {};
  }
  const hooks = root.hooks as Record<string, unknown>;
  const existing = hooks[eventName];
  if (Array.isArray(existing)) {
    return existing;
  }
  const next: unknown[] = [];
  hooks[eventName] = next;
  return next;
}

function normalizeHookGroup(v: unknown): { hooks: Array<{ type: string; command: string }> } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return null;
  }
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.hooks)) {
    return null;
  }
  const hooks = o.hooks
    .filter((x): x is { type: string; command: string } => {
      if (!x || typeof x !== "object" || Array.isArray(x)) {
        return false;
      }
      const hook = x as Record<string, unknown>;
      return typeof hook.type === "string" && typeof hook.command === "string";
    })
    .map((x) => ({ type: x.type, command: x.command }));
  return { hooks };
}

function hasFeatureEnabled(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  const raw = readFileSync(path, "utf-8");
  return /^\s*hooks\s*=\s*true\s*$/m.test(raw) || /^\s*codex_hooks\s*=\s*true\s*$/m.test(raw);
}

function ensureCodexHooksFeatureEnabled(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "[features]\nhooks = true\n", "utf-8");
    return;
  }
  const raw = readFileSync(path, "utf-8");
  if (/^\s*hooks\s*=\s*true\s*$/m.test(raw)) {
    return;
  }
  if (/^\s*codex_hooks\s*=\s*true\s*$/m.test(raw)) {
    const migrated = raw.replace(/^\s*codex_hooks\s*=\s*true\s*$/m, "hooks = true");
    writeFileSync(path, migrated, "utf-8");
    return;
  }
  if (/\[features\]/.test(raw)) {
    const next = raw.replace(/\[features\]\s*\n/, "[features]\nhooks = true\n");
    writeFileSync(path, next, "utf-8");
    return;
  }
  const sep = raw.endsWith("\n") ? "" : "\n";
  writeFileSync(path, `${raw}${sep}\n[features]\nhooks = true\n`, "utf-8");
}

export function installCodexSessionEndHook(gitRoot: string): { skipped: boolean; reason?: string } {
  const hooksPath = codexHooksPath(gitRoot);
  let root: CodexHooksFile;
  try {
    root = readHooksFile(hooksPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      skipped: true,
      reason: `${hooksPath} is not valid JSON (${msg}); leaving it unchanged.`,
    };
  }

  const groups = ensureHooksArray(root, CODEX_HOOK_EVENT);
  const normalized: unknown[] = [];
  let hasCommand = false;
  for (const raw of groups) {
    const group = normalizeHookGroup(raw);
    if (!group) {
      continue;
    }
    if (group.hooks.some((h) => h.type === "command" && h.command === QUORUM_CODEX_COMMAND)) {
      hasCommand = true;
    }
    normalized.push(group);
  }
  if (!hasCommand) {
    normalized.push({
      hooks: [{ type: "command", command: QUORUM_CODEX_COMMAND }],
    });
  }
  (root.hooks as Record<string, unknown>)[CODEX_HOOK_EVENT] = normalized;

  mkdirSync(dirname(hooksPath), { recursive: true });
  writeFileSync(hooksPath, `${JSON.stringify(root, null, 2)}\n`, "utf-8");
  ensureCodexHooksFeatureEnabled(codexConfigTomlPath(gitRoot));
  return { skipped: false };
}

export function removeCodexSessionEndHook(gitRoot: string): void {
  const hooksPath = codexHooksPath(gitRoot);
  if (!existsSync(hooksPath)) {
    return;
  }
  let root: CodexHooksFile;
  try {
    root = readHooksFile(hooksPath);
  } catch {
    return;
  }
  if (!root.hooks || typeof root.hooks !== "object" || Array.isArray(root.hooks)) {
    return;
  }
  const hooks = root.hooks as Record<string, unknown>;
  if (!Array.isArray(hooks[CODEX_HOOK_EVENT])) {
    return;
  }
  const kept = (hooks[CODEX_HOOK_EVENT] as unknown[])
    .map((raw) => normalizeHookGroup(raw))
    .filter((x): x is { hooks: Array<{ type: string; command: string }> } => !!x)
    .map((group) => ({ hooks: group.hooks.filter((h) => !(h.type === "command" && h.command === QUORUM_CODEX_COMMAND)) }))
    .filter((group) => group.hooks.length > 0);
  if (kept.length === 0) {
    delete hooks[CODEX_HOOK_EVENT];
  } else {
    hooks[CODEX_HOOK_EVENT] = kept;
  }
  if (Object.keys(hooks).length === 0) {
    delete root.hooks;
  }
  if (Object.keys(root).length === 0) {
    unlinkSync(hooksPath);
    return;
  }
  writeFileSync(hooksPath, `${JSON.stringify(root, null, 2)}\n`, "utf-8");
}

export function hasCodexSessionEndHook(gitRoot: string): boolean {
  const hooksPath = codexHooksPath(gitRoot);
  if (!existsSync(hooksPath)) {
    return false;
  }
  let root: CodexHooksFile;
  try {
    root = readHooksFile(hooksPath);
  } catch {
    return false;
  }
  if (!root.hooks || typeof root.hooks !== "object" || Array.isArray(root.hooks)) {
    return false;
  }
  const groups = (root.hooks as Record<string, unknown>)[CODEX_HOOK_EVENT];
  if (!Array.isArray(groups)) {
    return false;
  }
  const hasHook = groups
    .map((raw) => normalizeHookGroup(raw))
    .filter((x): x is { hooks: Array<{ type: string; command: string }> } => !!x)
    .some((group) => group.hooks.some((h) => h.type === "command" && h.command === QUORUM_CODEX_COMMAND));
  if (!hasHook) {
    return false;
  }
  return hasFeatureEnabled(codexConfigTomlPath(gitRoot));
}
