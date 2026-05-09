import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { claudeSettingsPath } from "../paths.js";

export const QUORUM_CLAUDE_COMMAND = "quorum internal claude-session-end";

type ClaudeSettings = {
  hooks?: Record<string, unknown>;
  [k: string]: unknown;
};

function readSettings(path: string): ClaudeSettings {
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
  return parsed as ClaudeSettings;
}

function ensureSessionEndHooksArray(settings: ClaudeSettings): unknown[] {
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown>;
  const existing = hooks.SessionEnd;
  if (Array.isArray(existing)) {
    return existing;
  }
  const next: unknown[] = [];
  hooks.SessionEnd = next;
  return next;
}

function normalizeEntry(v: unknown): { matcher: string; hooks: { type: string; command: string }[] } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return null;
  }
  const o = v as Record<string, unknown>;
  if (typeof o.matcher !== "string" || !Array.isArray(o.hooks)) {
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
  return { matcher: o.matcher, hooks };
}

export function installClaudeSessionEndHook(gitRoot: string): { skipped: boolean; reason?: string } {
  const path = claudeSettingsPath(gitRoot);
  let settings: ClaudeSettings;
  try {
    settings = readSettings(path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      skipped: true,
      reason: `${path} is not valid JSON (${msg}); leaving it unchanged.`,
    };
  }

  const entries = ensureSessionEndHooksArray(settings);
  let inserted = false;
  const normalized: unknown[] = [];
  let hasCommand = false;
  for (const raw of entries) {
    const entry = normalizeEntry(raw);
    if (!entry) {
      continue;
    }
    const has = entry.hooks.some((h) => h.type === "command" && h.command === QUORUM_CLAUDE_COMMAND);
    if (has) {
      hasCommand = true;
    }
    normalized.push(entry);
  }
  if (!hasCommand) {
    normalized.push({
      matcher: "*",
      hooks: [{ type: "command", command: QUORUM_CLAUDE_COMMAND }],
    });
    inserted = true;
  }
  (settings.hooks as Record<string, unknown>).SessionEnd = normalized;

  if (inserted || !existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  }
  return { skipped: false };
}

export function removeClaudeSessionEndHook(gitRoot: string): void {
  const path = claudeSettingsPath(gitRoot);
  if (!existsSync(path)) {
    return;
  }
  let settings: ClaudeSettings;
  try {
    settings = readSettings(path);
  } catch {
    return;
  }
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) {
    return;
  }
  const hooks = settings.hooks as Record<string, unknown>;
  if (!Array.isArray(hooks.SessionEnd)) {
    return;
  }
  const kept = (hooks.SessionEnd as unknown[])
    .map((raw) => normalizeEntry(raw))
    .filter((x): x is { matcher: string; hooks: { type: string; command: string }[] } => !!x)
    .map((entry) => ({
      matcher: entry.matcher,
      hooks: entry.hooks.filter((h) => !(h.type === "command" && h.command === QUORUM_CLAUDE_COMMAND)),
    }))
    .filter((entry) => entry.hooks.length > 0);

  if (kept.length === 0) {
    delete hooks.SessionEnd;
  } else {
    hooks.SessionEnd = kept;
  }
  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  }
  if (Object.keys(settings).length === 0) {
    unlinkSync(path);
    return;
  }
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}
