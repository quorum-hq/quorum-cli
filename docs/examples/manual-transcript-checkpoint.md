# Manual transcript + `quorum checkpoint`

This example shows how to **bring your own transcript** (a normal file in the repo), run **`quorum checkpoint`** so Quorum **distills** it into structured JSON on the **shadow branch**, and optionally **pin** a decision afterward.

Quorum does **not** generate transcripts. You (or another tool) write the source text; Quorum **reads** that file and produces a **session checkpoint** (summary JSON) for `brief`, `log`, reconcile, and related flows.

### Status: a pragmatic workaround (for now)

Treating **“any markdown file”** as a transcript and running **`quorum checkpoint --agent claude-code`** is intentionally **rough around the edges**: you are asking **headless Claude** to interpret text that may not look like a native Claude session log, or that came from **another agent** or **your own notes**. It works when the file is clear enough for distillation, but there is **no first-class “import from Cursor / Codex / …” pipeline** yet, and Quorum does not validate that the file matches a real session format.

We expect this flow to feel **hacky** until per-agent **capture + hook** wiring and/or **standard import formats** exist. **Thoughts on improving this are welcome** — for example: agreed transcript schemas, optional metadata (source agent, session id), dedicated `quorum import` / wrapper recipes, or better defaults for non-Claude distillers. If you have a concrete proposal, open an issue or PR on this repository (see [CONTRIBUTING.md](../../CONTRIBUTING.md)).

---

## Distillation support (read this first)

When you run `quorum checkpoint`, Quorum always runs **distillation**: an external process reads the transcript and must print a valid `<<QUORUM_JSON>>` … `<<END_QUORUM_JSON>>` envelope (see the root [README.md](../../README.md)).

**Production default today:** for **`--agent claude-code`**, Quorum invokes the **Claude Code** CLI in **non-interactive (headless) mode** — specifically `claude --print` with a fixed prompt — so distillation does not open an interactive session.

**Other agent ids** (`cursor`, `gemini-cli`, `opencode`, `codex`) are accepted on the CLI, but their **default** distillation commands are still **placeholders** until upstream CLIs stabilize. For those agents, use **`QUORUM_DISTILL_WRAPPER`** pointing at your own script (same README section) if you need reliable, scripted distillation.

**Tests / CI:** you can also set `QUORUM_DISTILL_WRAPPER` for `claude-code` to avoid calling the real Claude binary.

---

## Prerequisites

- A git repo with **`quorum init`** already run (so `.quorum/` exists and the shadow branch is configured).
- **`claude`** on your **`PATH`** if you rely on the default distiller for `--agent claude-code`.
- You are in the **repository root** (or a subdirectory of it) when you run `quorum`.

---

## Example A — Another coding agent produced the text

You worked in a tool that is **not** wired to Quorum’s SessionEnd hooks. You still want a Quorum checkpoint tied to **current `HEAD`**.

1. Ask that tool (or yourself) to **export or save** the session as a plain-text or Markdown file **inside the repo**, for example:

   `docs/agent-sessions/2026-05-10-codex-plan.md`

   Include enough context for distillation: goals, decisions, files touched, open questions.

2. From the repo root:

   ```bash
   quorum checkpoint --agent claude-code docs/agent-sessions/2026-05-10-codex-plan.md
   ```

   Quorum runs **headless Claude** distillation on that path, then commits the resulting **session** JSON on the shadow branch (default: `quorum/context/v1`).

3. Confirm context for a file you care about:

   ```bash
   quorum brief path/to/some-file.ts
   ```

If distillation fails (timeout, bad envelope, wrong CLI), Quorum may leave material under **`.quorum/sessions/pending/`**; use **`quorum retry`** after fixing the environment.

---

## Example B — Your own notes, then pin a decision

Sometimes the “transcript” is **not** a chat log but **your** written plan: constraints, tradeoffs, what you decided.

1. Create a file, for example **`notes/quorum-intent.md`**, with clear prose (still one file path for the distiller to read).

2. Checkpoint it (same as above):

   ```bash
   quorum checkpoint --agent claude-code notes/quorum-intent.md
   ```

3. After distillation, the checkpoint on the shadow branch contains **decisions** with ids. Mark one as **canonical** so brief tooling can treat it as pinned ground truth:

   ```bash
   quorum log
   quorum pin <checkpoint-id> <decision-id>
   ```

   Use **`quorum log`** (or inspect shadow JSON) to copy the real `checkpoint-id` and `decision-id` strings from your run.

---

## Where things live

| What | Where |
|------|--------|
| **Your transcript** (source) | Any path you choose; common choice is a tracked path under the repo (e.g. `docs/…`, `notes/…`). |
| **Hook copies** (SessionEnd only) | `.quorum/sessions/captures/` — Quorum copies the hook’s transcript here before distilling. Manual checkpoint reads your file **in place** unless you copy it yourself. |
| **Distilled checkpoint JSON** | Git objects on the **shadow branch** (e.g. `quorum/context/v1`), not on `main`. |

Quorum does **not** redact secrets from transcripts before distillation. Do not put credentials into files you distill (see the init security notice in the README).

---

## Related commands

| Command | Role |
|---------|------|
| `quorum checkpoint` | Distill a **file you point at** → session JSON on shadow branch. |
| `quorum retry` | Re-run distillation for the latest **failed** pending capture. |
| `quorum pin` | After a checkpoint exists, mark a **decision** as canonical in that checkpoint’s JSON. |
| `quorum reconcile` | After history rewrite (squash, rebase, amend), remap checkpoints to a new **landing** commit. |

For CI-only deterministic distillation without `claude`, set **`QUORUM_DISTILL_WRAPPER`** as documented in the root README.
