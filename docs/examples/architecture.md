# Quorum architecture (v0.1)

This document explains how `quorum-cli` works under the hood, with emphasis on the shadow-branch memory model and rewrite-safe retrieval.

## Core design principle

Quorum separates **code history** from **agent memory history**.

- Your feature/main branches stay focused on product code.
- Quorum stores distilled memory artifacts in a dedicated shadow branch (`quorum/context/v1` by default).
- Brief assembly reads those artifacts and emits context for the next agent run.

This gives teams durable memory without polluting normal git history.

## Shadow branch model

Quorum commits context artifacts to a branch dedicated to memory data.

Primary artifact types:

- **session checkpoints**: distilled outcomes from captured sessions
- **rewrite manifests**: mappings that preserve linkage after squash/rebase
- **pin state**: canonical decision markers used by brief assembly

Why this matters:

- team-shared memory stays versioned and reviewable
- context retrieval remains independent of working branch churn
- reconcile/rewrite logic can evolve without touching product code commits

## Capture pipeline

At a high level:

1. agent session ends
2. hook triggers a Quorum internal entrypoint
3. transcript capture is persisted under `.quorum/sessions/captures/`
4. distillation produces structured JSON (intent, decisions, files, open questions)
5. checkpoint is committed to the shadow branch

If distillation fails, Quorum keeps pending state and supports retry (`quorum retry`) instead of silently dropping memory.

## Retrieval pipeline (`quorum brief`)

`quorum brief [path]` assembles context by combining:

- file/path overlap relevance
- recency weighting
- pinned canonical decisions
- rewrite manifests (to bridge rewritten histories)
- token budgeting

Output is plain text intended to be piped directly into the next agent session, for example:

```bash
quorum brief src/auth/ | claude
```

## Rewrite-safe memory (squash/rebase)

Git rewrites can orphan old commit SHAs from normal ancestry.

Quorum handles this via:

- `post-rewrite` hook integration for local rewrites
- `quorum reconcile` for manual/CI-assisted bridging
- rewrite manifests that connect landing commits to absorbed checkpoints

This preserves decision continuity after squash-heavy workflows.

## Canonical decisions (pins)

Pins are durable "always include" signals for critical architecture/security decisions.

- `quorum pin <checkpoint-id> <decision-id>`
- `quorum unpin <checkpoint-id> <decision-id>`
- `quorum pins`

Pins reduce drift by ensuring important constraints are not out-ranked by short-term recency.

## Practical implementation techniques used

- **Git-native storage** instead of external database dependency in v0.1
- **Hook-driven automation** for low-friction capture
- **Wrapper-compatible distillation** for environment flexibility (`QUORUM_DISTILL_WRAPPER`)
- **Retryable failure handling** instead of lossy best-effort ingestion
- **Explicit limitation signaling** (agent coverage, secret redaction status) to keep trust high

## Scope note

This is the architecture for the shipping v0.1 CLI primitive. The broader Quorum workspace vision is documented at [quorum-hq.github.io](https://quorum-hq.github.io).
