import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { normalizeRepoPath } from "../brief/assemble.js";
import type { BriefCheckpoint } from "../checkpoint/squash-rollup.js";
import { parseSquashRollupCheckpointRecord } from "../checkpoint/squash-rollup.js";
import { parseSessionCheckpointRecord } from "../checkpoint/session.js";
import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import type { RewriteManifestV1 } from "../reconcile/manifest.js";
import { tryParseRewriteManifestJson } from "../reconcile/manifest.js";
import { prepareForDistilledReads, stripNoWaitFlag } from "../read-side/prepare-distilled-read.js";
import {
  listShadowJsonPaths,
  loadBriefCheckpointsFromShadow,
  readBlobText,
} from "../shadow/read-checkpoints.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

function lastShadowCommitEpochSec(gitRoot: string, shadowBranch: string, relPath: string): number {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%ct", shadowBranch, "--", relPath], {
      cwd: gitRoot,
      encoding: "utf-8",
    }).trim();
    const n = Number.parseInt(out, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

type ShadowArtifact =
  | { kind: "checkpoint"; path: string; checkpoint: BriefCheckpoint }
  | { kind: "rewrite"; path: string; manifest: RewriteManifestV1 };

function loadShadowArtifacts(gitRoot: string, shadowBranch: string): ShadowArtifact[] {
  const checkpoints = loadBriefCheckpointsFromShadow(gitRoot, shadowBranch);
  const pathById = new Map<string, string>();
  for (const p of listShadowJsonPaths(gitRoot, shadowBranch)) {
    try {
      const raw = JSON.parse(readBlobText(gitRoot, shadowBranch, p)) as { kind?: string; id?: string };
      if (raw.kind === "session" || raw.kind === "squash_rollup") {
        const stem = basename(p, ".json");
        pathById.set(stem, p);
      }
    } catch {
      /* skip */
    }
  }

  const out: ShadowArtifact[] = [];
  for (const cp of checkpoints) {
    const path = pathById.get(cp.id);
    if (path) {
      out.push({ kind: "checkpoint", path, checkpoint: cp });
    }
  }

  const manifests = loadRewriteManifestArtifacts(gitRoot, shadowBranch);
  for (const m of manifests) {
    out.push(m);
  }
  return out;
}

function loadRewriteManifestArtifacts(
  gitRoot: string,
  shadowBranch: string,
): { kind: "rewrite"; path: string; manifest: RewriteManifestV1 }[] {
  const out: { kind: "rewrite"; path: string; manifest: RewriteManifestV1 }[] = [];
  for (const p of listShadowJsonPaths(gitRoot, shadowBranch)) {
    let rawText: string;
    try {
      rawText = readBlobText(gitRoot, shadowBranch, p);
    } catch {
      continue;
    }
    const m = tryParseRewriteManifestJson(rawText, p);
    if (m) {
      out.push({ kind: "rewrite", path: p, manifest: m });
    }
  }
  return out;
}

function createdMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Recency key (ms): checkpoints by `created_at`; rewrite manifests by last commit touching the blob. Newest-first in `quorum log`. */
function sortKey(a: ShadowArtifact, gitRoot: string, shadowBranch: string): number {
  if (a.kind === "checkpoint") {
    return createdMs(a.checkpoint.created_at);
  }
  return lastShadowCommitEpochSec(gitRoot, shadowBranch, a.path) * 1000;
}

function filesIntersectPrefix(filesTouched: string[], prefixNorm: string): boolean {
  for (const f of filesTouched) {
    const n = normalizeRepoPath(f);
    if (n.length === 0) continue;
    if (n === prefixNorm || n.startsWith(`${prefixNorm}/`)) {
      return true;
    }
  }
  return false;
}

function formatFilesBrief(filesTouched: string[]): string {
  if (filesTouched.length === 0) return "—";
  const max = 4;
  const head = filesTouched.slice(0, max).map(normalizeRepoPath).join(", ");
  const extra = filesTouched.length > max ? ` (+${filesTouched.length - max} more)` : "";
  return `${head}${extra}`;
}

const LOG_RULE = "─".repeat(64);

function labelCol(label: string, value: string, labelWidth = 10): string {
  const pad = label.length < labelWidth ? " ".repeat(labelWidth - label.length) : " ";
  return `${label}${pad}${value}`;
}

/** Wrap intent text under a fixed label column (readable in narrow terminals). */
function wrapIntentLines(intent: string, labelWidth = 10, maxLineWidth = 92): string[] {
  const text = intent.replace(/\s+/g, " ").trim() || "—";
  const label = "intent";
  const gap = Math.max(1, labelWidth - label.length);
  const firstPrefix = `${label}${" ".repeat(gap)}`;
  const contPad = " ".repeat(labelWidth);
  const budget = Math.max(20, maxLineWidth - labelWidth);
  const out: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    let end = rest.length <= budget ? rest.length : rest.lastIndexOf(" ", budget);
    if (end <= 0) {
      end = Math.min(budget, rest.length);
    }
    const line = rest.slice(0, end).trim();
    rest = rest.slice(end).trim();
    if (line.length === 0) {
      break;
    }
    out.push(out.length === 0 ? `${firstPrefix}${line}` : `${contPad}${line}`);
  }
  return out.length > 0 ? out : [`${firstPrefix}—`];
}

function formatLogCheckpointBlock(cp: BriefCheckpoint): string {
  const lines: string[] = [LOG_RULE, labelCol("kind", cp.kind), labelCol("id", cp.id), labelCol("when", cp.created_at)];
  lines.push(...wrapIntentLines(cp.intent));
  lines.push(labelCol("files", formatFilesBrief(cp.files_touched)));
  lines.push(labelCol("agent", cp.agent));
  lines.push(labelCol("commit", cp.commit_sha));
  if (cp.kind === "squash_rollup") {
    const src = cp.sources;
    const srcSnippet =
      src.length <= 5 ? src.join(", ") : `${src.slice(0, 5).join(", ")} (+${src.length - 5} more)`;
    lines.push(labelCol("sources", srcSnippet));
  }
  lines.push("");
  lines.push(`  quorum show ${cp.id}`);
  return lines.join("\n");
}

function formatLogRewriteBlock(m: RewriteManifestV1, shadowPath: string): string {
  const ids = m.absorbed_checkpoint_ids;
  const snippet = ids.length <= 5 ? ids.join(", ") : `${ids.slice(0, 5).join(", ")} (+${ids.length - 5} more)`;
  const lines = [
    LOG_RULE,
    labelCol("kind", "rewrite"),
    labelCol("landing", m.landing_commit_sha),
    labelCol("absorbed", `${ids.length} checkpoint(s): ${snippet}`),
  ];
  if (m.pr_number != null) {
    lines.push(labelCol("pr", String(m.pr_number)));
  }
  lines.push(labelCol("path", shadowPath));
  lines.push("");
  lines.push(`  quorum show ${m.landing_commit_sha}`);
  return lines.join("\n");
}

function normalizePathFilterPrefix(arg: string): string {
  let s = arg.replace(/\\/g, "/").trim();
  if (s.startsWith("/")) s = s.slice(1);
  s = normalizeRepoPath(s.replace(/^\.\/+/, ""));
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

function resolveLogPrefixArg(_gitRoot: string, arg?: string): string | null {
  if (arg === undefined || arg.length === 0) return null;
  const out = normalizePathFilterPrefix(arg);
  return out.length === 0 ? null : out;
}

export async function runLog(gitRoot: string, argv: string[]): Promise<void> {
  const { argv: logArgv, noWait } = stripNoWaitFlag(argv);
  await prepareForDistilledReads(gitRoot, { noWait });

  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum log: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  const shadowBranch = merged.shadow_branch;
  let prefix: string | null = null;
  if (logArgv[0]) {
    prefix = resolveLogPrefixArg(gitRoot, logArgv[0]);
  }
  if (logArgv.length > 1) {
    eprint("quorum log: too many arguments (expected optional path prefix only)");
    eprint("  Usage: quorum log [--no-wait] [path-prefix]");
    process.exit(1);
  }

  let rows = loadShadowArtifacts(gitRoot, shadowBranch);

  if (prefix) {
    rows = rows.filter((r) => {
      if (r.kind !== "checkpoint") return false;
      return filesIntersectPrefix(r.checkpoint.files_touched, prefix!);
    });
  }

  rows.sort((a, b) => {
    const ka = sortKey(a, gitRoot, shadowBranch);
    const kb = sortKey(b, gitRoot, shadowBranch);
    if (ka !== kb) return kb - ka;
    const idA = a.kind === "checkpoint" ? a.checkpoint.id : a.path;
    const idB = b.kind === "checkpoint" ? b.checkpoint.id : b.path;
    return idB.localeCompare(idA);
  });

  if (rows.length === 0) {
    if (prefix) {
      eprint(`quorum log: no checkpoints in the shadow store touch ${prefix}`);
    } else {
      process.stdout.write(`No shadow artifacts on ${shadowBranch}.\n`);
    }
    process.exit(0);
    return;
  }

  const headerLines: string[] = [
    `Quorum shadow log · ${rows.length} ${rows.length === 1 ? "entry" : "entries"} · ${shadowBranch} · newest first`,
  ];
  if (prefix) {
    headerLines.push(`Filtered to paths under: ${prefix}/`);
  }
  headerLines.push("");

  const blocks: string[] = [];
  for (const r of rows) {
    if (r.kind === "checkpoint") {
      blocks.push(formatLogCheckpointBlock(r.checkpoint));
    } else {
      blocks.push(formatLogRewriteBlock(r.manifest, r.path));
    }
  }

  process.stdout.write(`${headerLines.join("\n")}${blocks.join("\n\n")}\n`);
}

function formatCheckpointHuman(cp: BriefCheckpoint): string {
  const lines: string[] = ["Checkpoint", LOG_RULE, labelCol("kind", cp.kind), labelCol("id", cp.id)];
  lines.push(labelCol("created", cp.created_at), labelCol("agent", cp.agent), labelCol("commit", cp.commit_sha));
  if (cp.kind === "session") {
    lines.push(labelCol("session", cp.session_id));
    if (cp.branch) {
      lines.push(labelCol("branch", cp.branch));
    }
    if (cp.pr_number != null) {
      lines.push(labelCol("pr", String(cp.pr_number)));
    }
  } else {
    lines.push(labelCol("rollup_id", cp.rollup_id));
    lines.push(labelCol("sources", cp.sources.length ? cp.sources.join(", ") : "—"));
  }
  lines.push("");
  lines.push(...wrapIntentLines(cp.intent));
  lines.push("");
  lines.push(labelCol("files", formatFilesBrief(cp.files_touched)));
  lines.push("");
  if (cp.decisions.length === 0) {
    lines.push("Decisions  (none)");
  } else {
    lines.push(`Decisions  (${cp.decisions.length})`);
    for (const d of cp.decisions) {
      const pin = d.canonical ? "  [pinned]" : "";
      lines.push(`  • ${d.id}${pin}`);
      lines.push(`    topic        ${d.topic}`);
      lines.push(`    conclusion   ${d.conclusion}`);
      lines.push(`    rationale    ${d.rationale}`);
    }
  }
  if (cp.open_questions.length > 0) {
    lines.push("");
    lines.push("Open questions");
    for (const q of cp.open_questions) {
      lines.push(`  · ${q}`);
    }
  }
  lines.push("");
  lines.push(`Machine-readable JSON:  quorum show ${cp.id} --json`);
  return `${lines.join("\n")}\n`;
}

function formatRewriteShowHuman(m: RewriteManifestV1, shadowPath: string): string {
  const lines: string[] = [
    "Rewrite manifest",
    LOG_RULE,
    labelCol("landing", m.landing_commit_sha),
    labelCol("path", shadowPath),
    "",
    `Absorbed checkpoint ids (${m.absorbed_checkpoint_ids.length})`,
  ];
  for (const id of m.absorbed_checkpoint_ids) {
    lines.push(`  · ${id}`);
  }
  if (m.pr_number != null) {
    lines.push("");
    lines.push(labelCol("pr", String(m.pr_number)));
  }
  lines.push("");
  lines.push(`Machine-readable JSON:  quorum show ${m.landing_commit_sha} --json`);
  return `${lines.join("\n")}\n`;
}

function formatArtifactHuman(rawText: string, shadowPath: string): string {
  const stem = basename(shadowPath, ".json");
  const manifest = tryParseRewriteManifestJson(rawText, shadowPath);
  if (manifest) {
    return formatRewriteShowHuman(manifest, shadowPath);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    return rawText.endsWith("\n") ? rawText : `${rawText}\n`;
  }
  try {
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw) && (raw as { kind?: string }).kind === "session") {
      return formatCheckpointHuman(parseSessionCheckpointRecord(raw, stem));
    }
    if (
      typeof raw === "object" &&
      raw !== null &&
      !Array.isArray(raw) &&
      (raw as { kind?: string }).kind === "squash_rollup"
    ) {
      return formatCheckpointHuman(parseSquashRollupCheckpointRecord(raw, stem));
    }
  } catch {
    /* fall through to JSON */
  }
  return `${JSON.stringify(raw, null, 2)}\n`;
}

function parseShowCliArgs(argv: string[]): { query: string; json: boolean; badUsage: boolean } {
  let json = false;
  const rest: string[] = [];
  for (const a of argv) {
    if (a === "--json" || a === "-j") {
      json = true;
    } else {
      rest.push(a);
    }
  }
  if (rest.length !== 1 || !rest[0]) {
    return { query: "", json, badUsage: true };
  }
  return { query: rest[0], json, badUsage: false };
}

type IndexedShowTarget = {
  path: string;
  rawText: string;
  checkpointId?: string;
  landingSha?: string;
};

function buildShowIndex(gitRoot: string, shadowBranch: string): IndexedShowTarget[] {
  const out: IndexedShowTarget[] = [];
  for (const p of listShadowJsonPaths(gitRoot, shadowBranch)) {
    let rawText: string;
    try {
      rawText = readBlobText(gitRoot, shadowBranch, p);
    } catch {
      continue;
    }
    const m = tryParseRewriteManifestJson(rawText, p);
    if (m) {
      out.push({ path: p, rawText, landingSha: m.landing_commit_sha });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(rawText) as unknown;
    } catch {
      continue;
    }
    if (
      typeof raw === "object" &&
      raw !== null &&
      !Array.isArray(raw) &&
      ((raw as { kind?: string }).kind === "session" || (raw as { kind?: string }).kind === "squash_rollup") &&
      typeof (raw as { id?: string }).id === "string"
    ) {
      out.push({ path: p, rawText, checkpointId: (raw as { id: string }).id });
    }
  }
  return out;
}

function formatShowCandidate(t: IndexedShowTarget): string {
  const label = t.checkpointId ?? t.landingSha ?? basename(t.path, ".json");
  return `${label} (${t.path})`;
}

function dedupeTargetsByPath(ts: IndexedShowTarget[]): IndexedShowTarget[] {
  const seen = new Set<string>();
  const out: IndexedShowTarget[] = [];
  for (const t of ts) {
    if (!seen.has(t.path)) {
      seen.add(t.path);
      out.push(t);
    }
  }
  return out;
}

function resolveShowTarget(
  index: IndexedShowTarget[],
  query: string,
):
  | { ok: true; target: IndexedShowTarget }
  | { ok: false; reason: "none" | "ambiguous"; candidates: string[] } {
  const q = query.trim();
  if (q.length === 0) {
    return { ok: false, reason: "none", candidates: [] };
  }

  const lower = q.toLowerCase();
  const isFullSha = /^[0-9a-f]{40}$/i.test(q);

  const exact: IndexedShowTarget[] = [];
  for (const t of index) {
    let hit = false;
    if (t.checkpointId !== undefined && t.checkpointId === q) hit = true;
    if (t.landingSha !== undefined && isFullSha && t.landingSha === lower) hit = true;
    const stem = basename(t.path, ".json");
    if (stem === q) hit = true;
    if (hit) exact.push(t);
  }

  const uniqueExact = dedupeTargetsByPath(exact);
  if (uniqueExact.length === 1) return { ok: true, target: uniqueExact[0] };
  if (uniqueExact.length > 1) {
    return { ok: false, reason: "ambiguous", candidates: uniqueExact.map(formatShowCandidate).sort() };
  }

  const prefixes: IndexedShowTarget[] = [];
  for (const t of index) {
    const stem = basename(t.path, ".json");
    let hit = false;
    if (t.checkpointId !== undefined && t.checkpointId.startsWith(q) && t.checkpointId !== q) hit = true;
    if (!hit && stem.startsWith(q) && stem !== q) hit = true;
    if (
      !hit &&
      !isFullSha &&
      t.landingSha !== undefined &&
      lower.length >= 8 &&
      t.landingSha.startsWith(lower) &&
      t.landingSha !== lower
    ) {
      hit = true;
    }
    if (hit) prefixes.push(t);
  }

  const uniquePref = dedupeTargetsByPath(prefixes);
  if (uniquePref.length === 1) return { ok: true, target: uniquePref[0] };
  if (uniquePref.length > 1) {
    return { ok: false, reason: "ambiguous", candidates: uniquePref.map(formatShowCandidate).sort() };
  }

  return { ok: false, reason: "none", candidates: [] };
}

/**
 * Default stdout is a readable layout; pass `--json` for indented JSON (scripts, jq).
 * Pipe long output through `less` if needed.
 */
export function runShow(gitRoot: string, argv: string[]): void {
  const parsed = parseShowCliArgs(argv);
  if (parsed.badUsage) {
    eprint(
      "Usage: quorum show [--json] <id>\n" +
        "  Default: human-readable summary of a shadow checkpoint or rewrite manifest.\n" +
        "  --json: indented JSON (checkpoint session/squash_rollup or rewrite manifest).\n" +
        "  Ids resolve to an exact checkpoint id, shadow filename stem, or rewrite landing commit SHA (40 hex).\n" +
        "  If multiple artifacts share the same id prefix, quorum reports an ambiguous match—use a longer id.",
    );
    process.exit(1);
  }

  let merged;
  try {
    merged = loadMergedConfig(gitRoot);
  } catch (e) {
    if (e instanceof ConfigError) {
      eprint(`quorum show: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  const { query, json } = parsed;
  const index = buildShowIndex(gitRoot, merged.shadow_branch);
  const resolved = resolveShowTarget(index, query);

  if (!resolved.ok) {
    if (resolved.reason === "ambiguous") {
      eprint(`quorum show: ambiguous id ${JSON.stringify(query)} — candidates:\n  ${resolved.candidates.join("\n  ")}`);
      process.exit(1);
    }
    eprint(`quorum show: no shadow artifact matched ${JSON.stringify(query)}`);
    process.exit(1);
  }

  const target = resolved.target;
  if (json) {
    try {
      const obj = JSON.parse(target.rawText) as unknown;
      process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
    } catch {
      process.stdout.write(target.rawText.endsWith("\n") ? target.rawText : `${target.rawText}\n`);
    }
    return;
  }

  process.stdout.write(formatArtifactHuman(target.rawText, target.path));
}
