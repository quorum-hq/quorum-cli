# quorum-cli

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Status: Beta](https://img.shields.io/badge/status-beta-orange.svg)](#beta-status)

```text
 ██████╗ ██╗   ██╗ ██████╗ ██████╗ ██╗   ██╗███╗   ███╗
██╔═══██╗██║   ██║██╔═══██╗██╔══██╗██║   ██║████╗ ████║
██║   ██║██║   ██║██║   ██║██████╔╝██║   ██║██╔████╔██║
██║▄▄ ██║██║   ██║██║   ██║██╔══██╗██║   ██║██║╚██╔╝██║
╚██████╔╝╚██████╔╝╚██████╔╝██║  ██║╚██████╔╝██║ ╚═╝ ██║
 ╚══▀▀═╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝
```

**Quorum makes your next agent session actually smart.**

It captures what your team already decided and carries that context forward so agents stop restarting from zero.

`BETA` `OPEN SOURCE` `TEAM MEMORY`

---

## Real pain points this solves

Agent coding is fast. Team coordination around agents is still broken.

- **ERR-01: Context dies when sessions end.** Decisions and rationale disappear when the terminal closes.
- **ERR-02: Agents misalign with team intent.** PM/designer/architect context never reaches the next run.
- **ERR-03: Parallel work has no semantic memory.** Agents collide on decisions, even when file conflicts are avoided.

Quorum fixes that loop with one primitive:

1. capture session outcomes through hooks
2. distill to structured checkpoints on `quorum/context/v1`
3. generate relevant briefs for the next session

**Quorum tells your agent what it needs to know before it writes code.**

---

## Before vs after

### Before Quorum

```bash
# teammate already worked on src/auth/
claude

# agent starts blind
# prior decisions are missing
# you manually re-explain architecture every session
```

### After Quorum

```bash
# one-time setup
quorum init
quorum status

# normal sessions are captured automatically by hooks

# before next task, pipe context directly
quorum brief src/auth/ | claude
```

## Install

```bash
npm install -g quorum-cli
```

Requires Node.js `>=20` and git.

**Platform support (v0.1):**

- macOS: supported
- Linux: supported
- Windows: not supported in v0.1

## Command name and version semantics

Quorum installs the `quorum` binary.

If `quorum` already exists on your machine, check resolution order:

```bash
which -a quorum
```

If another binary comes first, run Quorum through npm exec:

```bash
npx quorum-cli version
```

`quorum version` reports the installed CLI artifact version (the package version you installed), so it is the canonical check for release/debug reports.

---

## Quick start (automatic flow)

```bash
# initialize once per repo
quorum init

# check hooks + health
quorum status

# after regular coding sessions, ask for focused context
quorum brief src/

# run with context
quorum brief src/ | claude
```

## Capabilities in v0.1

### Capture and memory pipeline

- **Automatic capture hooks:** `quorum init`, `quorum install`, `quorum disable`, `quorum status`
- **Structured checkpoint distillation:** `quorum checkpoint`, `quorum retry`
- **Team-shared memory storage:** checkpoints on git shadow branch `quorum/context/v1`

### Retrieval and decision continuity

- **Context assembly for next session:** `quorum brief [path]` with relevance + token budgeting
- **Canonical decision controls:** `quorum pin`, `quorum unpin`, `quorum pins`
- **Traceability and inspection:** `quorum log`, `quorum show`

### Rewrite-safe history

- **Local rewrite bridge:** git `post-rewrite` hook support
- **Manual/server-side reconcile:** `quorum reconcile`
- **GitHub squash workflows:** supported via shipped workflow recipe

### Why pins matter

Pins are not just bookmarks. They are how teams encode architectural rules that must survive session boundaries.

- Without pins, high-value decisions compete with recency and may drop out of normal ranking.
- With pins, critical constraints stay in every relevant brief, reducing architectural drift.
- In the larger Quorum vision, pins are the durable contract layer between team intent and agent execution.

## Pinning decisions (and why teams should use it)

Pinning is how you convert one good decision into a repeatable team guardrail.

When a decision is pinned, Quorum treats it as canonical memory for future brief assembly on relevant files. This is especially useful for security constraints, architecture boundaries, migration rules, and "do not change" decisions.

Advantages:

- prevents important rules from being drowned out by newer but less important context
- keeps cross-session and cross-teammate behavior consistent
- reduces re-litigation of already-settled technical decisions
- gives agents a stable baseline before they start generating code

Example flow:

```bash
# Find recent checkpoints and decisions
quorum log
quorum show <checkpoint-id>

# Pin a decision from that checkpoint
quorum pin <checkpoint-id> <decision-id>

# Verify current canonical pins
quorum pins

# Use brief with pinned context included
quorum brief src/auth/ | claude
```

If a rule changes later, remove the old pin and replace it with the updated decision:

```bash
quorum unpin <checkpoint-id> <decision-id>
```

## How the system works

```text
agent session ends
  -> hook fires
  -> transcript capture persisted under .quorum/sessions/captures/
  -> distillation to structured JSON checkpoint
  -> checkpoint committed to quorum/context/v1
  -> optional sync / reconcile for rewrite scenarios

next session starts
  -> quorum brief [path]
  -> relevance by file overlap + recency + pins + rewrite manifests
  -> brief emitted to stdout
  -> pipe to agent (e.g. quorum brief src/auth/ | claude)
```

Operationally: this keeps context in git-native artifacts, not in ad-hoc chat history.

---

## Command reference (v0.1)

Use `quorum --help` for full syntax and flags. The core command surface:

### Setup and lifecycle

- `quorum init` - bootstrap Quorum in the current repo (config + shadow branch + hooks)
- `quorum install` - install hooks for an already-configured repo/clone
- `quorum status` - show current hook and setup health
- `quorum disable` - remove Quorum-managed hooks without deleting stored context
- `quorum version` - print installed CLI artifact version

### Capture and recovery

- `quorum checkpoint --agent <id> <transcript-path>` - distill a transcript into a structured checkpoint
- `quorum retry` - retry the latest failed/pending distillation

### Brief and context retrieval

- `quorum brief [path]` - assemble focused context for the path/module you are about to work on

### Canonical decisions (pins)

- `quorum pin <checkpoint-id> <decision-id>` - mark a decision as canonical
- `quorum unpin <checkpoint-id> <decision-id>` - remove canonical status from a decision
- `quorum pins` - list currently pinned canonical decisions

### History, rewrite, and inspection

- `quorum reconcile --landing <sha> ...` - bridge rewritten history (squash/rebase) back to existing checkpoints
- `quorum log [path]` - list checkpoint/manifest history, optionally path-filtered
- `quorum show <id-or-landing-sha>` - inspect a specific checkpoint or rewrite manifest

### Internal hooks

- `quorum internal ...` - hook entrypoints used by Quorum itself (not intended for normal interactive usage)

## Limitations right now

- **Production-ready auto-capture currently supports `claude-code` only.**
- `cursor`, `gemini-cli`, `opencode`, and `codex` are not first-class auto-capture integrations in this version.
- Non-Claude flows may need wrapper-based distillation setup.
- Quorum currently does **not** redact secrets from transcripts before distillation.

Broader first-class agent support is planned in future versions.

---

## Docs and examples

- [Architecture deep dive (shadow branch, capture/retrieval, reconcile)](docs/examples/architecture.md)
- [Developer setup (`config.json` vs `local.json`, `init` vs `install`)](docs/examples/developer-setup.md)
- [Post-rewrite hook -> rewrite manifest walkthrough](docs/examples/post-rewrite-hook-rewrite-manifest.md)
- [Distill wrapper guide (`QUORUM_DISTILL_WRAPPER`)](docs/examples/quorum-distill-wrapper.md)
- [GitHub Actions example for squash-merge reconcile](docs/examples/quorum-reconcile-squash-merge.yml)

## Product direction

`quorum-cli` is the shipping primitive for a larger multiplayer workspace direction.

Full vision: [quorum-hq.github.io](https://quorum-hq.github.io)

---

## Homebrew status

Homebrew distribution is planned but not published yet.

- Current install path: `npm install -g quorum-cli`
- Future path: official tap/formula docs will be added here when released

---

## Contact

- Email: [kachhwalvansh230@gmail.com](mailto:kachhwalvansh230@gmail.com)
- LinkedIn: [linkedin.com/in/kachhwalvansh](https://www.linkedin.com/in/kachhwalvansh/)

---

## Beta status

This is an active beta started as a personal project and now shaped by real team workflows. If something breaks or does not fit your setup, open an issue.

- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security: [SECURITY.md](SECURITY.md)

GIF demo: coming soon.
