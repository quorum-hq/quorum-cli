# Post-rewrite hook → rewrite manifest (local e2e)

This example walks through what happens in a **small repo** after **`quorum init`**, a few **`quorum checkpoint`** runs, and a **history rewrite** (`git commit --amend` or rebase). It matches the kind of **`quorum log`** output where you see a **`kind: rewrite`** entry **above** session rows whose **`commit`** still shows an **older** SHA.

The **`post-rewrite` Git hook** is the mechanism: Git runs it after certain rewrites and feeds **`<old-sha> <new-sha>`** lines on stdin; Quorum turns that into **`rewrite/<landing>.json`** on the shadow branch so **`quorum brief`** can keep using those checkpoint ids at the new **`HEAD`**.

---

## What the `post-rewrite` hook is (installed by `quorum init`)

Quorum installs **`.git/hooks/post-rewrite`** when it can (see `src/git/hooks.ts`). The file looks like this:

```sh
#!/bin/sh
# quorum-managed
# Quorum post-rewrite: record rewrite manifests on the shadow branch after rebase/amend.
command -v quorum >/dev/null 2>&1 || exit 0
quorum internal post-rewrite "$@" || exit 0
```

**Behavior:**

1. If **`quorum`** is not on **`PATH`**, the hook exits quietly (no manifest).
2. Otherwise Git invokes **`quorum internal post-rewrite`** (with Git’s usual arguments for this hook).
3. Quorum **reads stdin** as lines of **`old_sha new_sha`** (40-hex git object ids).
4. For each **`new_sha`**, it finds **session** checkpoints on the shadow branch whose **`commit_sha`** was one of the **`old_sha`** values for that line, and writes **`rewrite/<new_sha>.json`** listing those checkpoint ids as **absorbed** for that **landing** commit.

That is the same **rewrite manifest** shape you get from **`quorum reconcile --landing <sha> --checkpoint …`**, but here it is **derived automatically** from Git’s mapping instead of you passing flags.

---

## Prerequisites

- **`quorum init`** has been run in the repo (`.quorum/` and shadow branch exist).
- **`quorum`** is on **`PATH`** when Git runs hooks (otherwise the hook no-ops).
- **`quorum status`** reports **`post-rewrite: hooked`** (and optionally **`claude-code: hooked`** if you use SessionEnd capture).

**Sanity check** (from repo root; note the **dot** in `.git`):

```bash
quorum status
test -f .git/hooks/post-rewrite && grep -q quorum-managed .git/hooks/post-rewrite && echo "Quorum post-rewrite installed"
```

---

## Example flow (manual checkpoints + amend)

Assume you already committed something (e.g. **`README.md`**) and ran **`quorum init`**.

1. **Create transcripts** (under `notes/`, `docs2/`, etc.) and distill them into session checkpoints tied to **current `HEAD`**:

   ```bash
   quorum checkpoint --agent claude-code notes/session-a.md
   quorum checkpoint --agent claude-code notes/session-b.md
   ```

2. **Rewrite history** so **`HEAD`** changes while keeping one commit, for example:

   ```bash
   echo "small fix" >> README.md
   git add README.md
   git commit --amend --no-edit
   ```

   Git runs **`post-rewrite`**. Quorum reads stdin like **`a9f442cf… 3eb21922…`** and writes **`rewrite/3eb21922….json`** on the shadow branch (landing = **new** commit).

3. **Inspect shadow history** — you should see a **rewrite** row and your **session** rows. **`quorum log`** may look like:

   ```text
   Quorum shadow log · N entries · quorum/context/v1 · newest first
   ────────────────────────────────────────────────────────────────
   kind      rewrite
   landing   3eb21922f78f25eea93d934fd54c3d9405372741
   absorbed  3 checkpoint(s): 2026-05-10-…, 2026-05-10-…, …
   path      rewrite/3eb21922f78f25eea93d934fd54c3d9405372741.json

     quorum show 3eb21922f78f25eea93d934fd54c3d9405372741

   ────────────────────────────────────────────────────────────────
   kind      session
   id        2026-05-10-…
   …
   commit    a9f442cf19caeaa366292c55b6bd322dd9c2af05
   ```

   **Important:** session JSON on the shadow branch still stores the **original** **`commit_sha`** (`a9f442cf…` in this illustration). The **rewrite** row is what tells Quorum those checkpoint ids **still apply** at **`HEAD`** (`3eb21922…`).

4. **Confirm brief still has context** for files those sessions touched:

   ```bash
   quorum brief README.md
   ```

---

## If the hook is missing or `quorum` was not on `PATH`

No **`rewrite/<head>.json`** is written automatically. Session checkpoints whose **`commit_sha`** is no longer an ancestor of **`HEAD`** will not be picked up for **`quorum brief`** until you either re-enable the hook and redo a trivial rewrite, or run **`quorum reconcile`** explicitly:

```bash
LANDING="$(git rev-parse HEAD)"
quorum reconcile --landing "$LANDING" --checkpoint "<checkpoint-id>"
# and/or:  --pr <n>
```

See also [manual transcript + checkpoint](manual-transcript-checkpoint.md) and the squash-merge workflow [quorum-reconcile-squash-merge.yml](quorum-reconcile-squash-merge.yml) for CI-style **`quorum reconcile`**.

---

## Related commands

| Command | Role |
|---------|------|
| `quorum status` | Shows whether **`post-rewrite`** (and agent hooks) are installed. |
| `quorum log` / `quorum show` | Lists shadow JSON, including **`kind: rewrite`** manifests. |
| `quorum internal post-rewrite` | What the hook runs; stdin is Git’s **`old new`** mapping (normally you do not invoke this by hand). |
| `quorum reconcile` | Manual rewrite manifest when hooks are off or Git did not run **`post-rewrite`**. |
| `quorum disable` | Removes Quorum-managed hooks (including **`post-rewrite`**); useful to practice manual reconcile. |
