import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { normalizeRepoPath } from "../brief/assemble.js";
import type { BriefCheckpoint } from "../checkpoint/squash-rollup.js";
import { loadMergedConfig } from "../config/load.js";
import { ConfigError } from "../config/validate.js";
import type { RewriteManifestV1 } from "../reconcile/manifest.js";
import { tryParseRewriteManifestJson } from "../reconcile/manifest.js";
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

/** Oldest-first: checkpoints by `created_at`; rewrite manifests by last commit touching the blob. */
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
  if (filesTouched.length === 0) return "files: —";
  const max = 2;
  const head = filesTouched.slice(0, max).map(normalizeRepoPath).join(", ");
  const extra = filesTouched.length > max ? ` (+${filesTouched.length - max} more)` : "";
  return `files: ${head}${extra}`;
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

export function runLog(gitRoot: string, argv: string[]): void {
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
  if (argv[0]) {
    prefix = resolveLogPrefixArg(gitRoot, argv[0]);
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
    if (ka !== kb) return ka - kb;
    const idA = a.kind === "checkpoint" ? a.checkpoint.id : a.path;
    const idB = b.kind === "checkpoint" ? b.checkpoint.id : b.path;
    return idA.localeCompare(idB);
  });

  const lines: string[] = [
    prefix
      ? `when\tkind\tid\tintent/summary\tfiles/detail (filtered: ${prefix}/)`
      : `when\tkind\tid\tintent/summary\tfiles/detail`,
  ];
  for (const r of rows) {
    if (r.kind === "checkpoint") {
      const cp = r.checkpoint;
      const intent = cp.intent.replace(/\s+/g, " ").trim();
      lines.push(`${cp.created_at}\t${cp.kind}\t${cp.id}\t${intent}\t${formatFilesBrief(cp.files_touched)}`);
    } else {
      const ids = r.manifest.absorbed_checkpoint_ids;
      const snippet = ids.length <= 3 ? ids.join(", ") : `${ids.slice(0, 3).join(", ")} (+${ids.length - 3} more)`;
      lines.push(
        `\trewrite\t${r.manifest.landing_commit_sha}\tlanding manifest; absorbed: ${snippet}\t${r.path}`,
      );
    }
  }

  if (rows.length === 0 && prefix) {
    eprint(`quorum log: no checkpoints in the shadow store touch ${prefix}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
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

/** Pretty-print JSON for stdout (no pager; pipe to less if needed — see stderr on missing id). */
export function runShow(gitRoot: string, argv: string[]): void {
  if (!argv[0]) {
    eprint(
      "Usage: quorum show <id>\n" +
        "  Prints indented JSON from the shadow store (checkpoint session/squash_rollup or rewrite manifest).\n" +
        "  Ids resolve to an exact checkpoint id, shadow filename stem, or rewrite landing commit SHA (40 hex).\n" +
        "  If multiple artifacts share the same id prefix, quorum reports an ambiguous match—use a longer id.\n" +
        "  Output is not paged; use `quorum show <id> | less` for long JSON.",
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

  const query = argv[0];
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
  try {
    const obj = JSON.parse(target.rawText) as unknown;
    process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  } catch {
    process.stdout.write(target.rawText.endsWith("\n") ? target.rawText : `${target.rawText}\n`);
  }
}
