# quorum-cli

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

`BETA` `OPEN SOURCE` `TEAM MEMORY` `ENGINEER-BUILT`

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

## Limitations right now

- **Production-ready auto-capture currently supports `claude-code` only.**
- `cursor`, `gemini-cli`, `opencode`, and `codex` are not first-class auto-capture integrations in this version.
- Non-Claude flows may need wrapper-based distillation setup.
- Quorum currently does **not** redact secrets from transcripts before distillation.

Broader first-class agent support is planned in future versions.

## Docs and examples

- [Developer setup (`config.json` vs `local.json`, `init` vs `install`)](docs/examples/developer-setup.md)
- [Post-rewrite hook -> rewrite manifest walkthrough](docs/examples/post-rewrite-hook-rewrite-manifest.md)
- [Distill wrapper guide (`QUORUM_DISTILL_WRAPPER`)](docs/examples/quorum-distill-wrapper.md)
- [GitHub Actions example for squash-merge reconcile](docs/examples/quorum-reconcile-squash-merge.yml)

## Product direction

`quorum-cli` is the shipping primitive for a larger multiplayer workspace direction.

Full vision: [quorum-hq.github.io](https://quorum-hq.github.io)

## Beta status

This is an active beta started as a personal project and now shaped by real team workflows. If something breaks or does not fit your setup, open an issue.

- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security: [SECURITY.md](SECURITY.md)

GIF demo: coming soon.
