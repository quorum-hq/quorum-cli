import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type HookSettings = {
  hooks?: Record<string, unknown>;
  [k: string]: unknown;
};

type HookEntry = { matcher: string; hooks: { type: string; command: string }[] };

function readSettings(path: string): HookSettings {
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
  return parsed as HookSettings;
}

function ensureEventHooksArray(settings: HookSettings, eventName: string): unknown[] {
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown>;
  const existing = hooks[eventName];
  if (Array.isArray(existing)) {
    return existing;
  }
  const next: unknown[] = [];
  hooks[eventName] = next;
  return next;
}

function normalizeEntry(v: unknown): HookEntry | null {
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

export function installJsonSessionEndHook(
  path: string,
  command: string,
  eventName = "SessionEnd",
): { skipped: boolean; reason?: string } {
  let settings: HookSettings;
  try {
    settings = readSettings(path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      skipped: true,
      reason: `${path} is not valid JSON (${msg}); leaving it unchanged.`,
    };
  }

  const entries = ensureEventHooksArray(settings, eventName);
  let inserted = false;
  const normalized: unknown[] = [];
  let hasCommand = false;
  for (const raw of entries) {
    const entry = normalizeEntry(raw);
    if (!entry) {
      continue;
    }
    const has = entry.hooks.some((h) => h.type === "command" && h.command === command);
    if (has) {
      hasCommand = true;
    }
    normalized.push(entry);
  }
  if (!hasCommand) {
    normalized.push({
      matcher: "*",
      hooks: [{ type: "command", command }],
    });
    inserted = true;
  }
  (settings.hooks as Record<string, unknown>)[eventName] = normalized;

  if (inserted || !existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  }
  return { skipped: false };
}

export function removeJsonSessionEndHook(path: string, command: string, eventName = "SessionEnd"): void {
  if (!existsSync(path)) {
    return;
  }
  let settings: HookSettings;
  try {
    settings = readSettings(path);
  } catch {
    return;
  }
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) {
    return;
  }
  const hooks = settings.hooks as Record<string, unknown>;
  if (!Array.isArray(hooks[eventName])) {
    return;
  }
  const kept = (hooks[eventName] as unknown[])
    .map((raw) => normalizeEntry(raw))
    .filter((x): x is HookEntry => !!x)
    .map((entry) => ({
      matcher: entry.matcher,
      hooks: entry.hooks.filter((h) => !(h.type === "command" && h.command === command)),
    }))
    .filter((entry) => entry.hooks.length > 0);

  if (kept.length === 0) {
    delete hooks[eventName];
  } else {
    hooks[eventName] = kept;
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

export function hasJsonSessionEndHook(path: string, command: string, eventName = "SessionEnd"): boolean {
  if (!existsSync(path)) {
    return false;
  }
  let settings: HookSettings;
  try {
    settings = readSettings(path);
  } catch {
    return false;
  }
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) {
    return false;
  }
  const hooks = settings.hooks as Record<string, unknown>;
  if (!Array.isArray(hooks[eventName])) {
    return false;
  }
  return (hooks[eventName] as unknown[])
    .map((raw) => normalizeEntry(raw))
    .filter((x): x is HookEntry => !!x)
    .some((entry) => entry.hooks.some((h) => h.type === "command" && h.command === command));
}
