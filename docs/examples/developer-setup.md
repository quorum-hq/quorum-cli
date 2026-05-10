# Developer setup (solo + small teams)

## `config.json` vs `local.json`

| | **`.quorum/config.json`** | **`.quorum/local.json`** |
|--|---------------------------|--------------------------|
| **Purpose** | Shared defaults for the repo (usually **committed**). | **Per-machine** overrides (should stay **gitignored**). |
| **Merge** | Base. | Wins for any key you set (shallow merge on top of `config.json`). |
| **Examples** | `agents`, `shadow_branch`, `install_git_rewrite_hook` default for the team. | `install_git_rewrite_hook: true` for you only, personal timeouts, etc. |

Unknown keys in `local.json` are ignored (forward compatible). `quorum install` **does not** wipe `local.json`: it creates `{}` if missing, otherwise **only validates** it.

---

## `quorum init` vs `quorum install`

| | **`quorum init`** | **`quorum install`** |
|--|-------------------|----------------------|
| **Needs** | Nothing Quorum-specific yet (creates config if missing). | **`.quorum/config.json` must already exist.** |
| **Does** | Default **`config.json`**, **`local.json`**, gitignore block, **shadow branch**, hooks from **merged** config, security notice. | **`local.json`** if missing, gitignore block, hooks from **merged** config only. |
| **Does not** | — | Create or fix the shadow branch; does not invent committed config. |

**When to use `init`:** first time Quorum in this clone (solo project or greenfield).  
**When to use `install`:** you **cloned** a repo that **already commits** `.quorum/config.json`, or you changed hook-related settings and want hooks re-applied without re-bootstrapping the shadow branch. After **`quorum disable`**, use **`install`** (or **`init`**) to put hooks back.

**Hooks are not cloned:** `.git/hooks/` is local. Shared **`config.json`** does not install hooks on a new laptop by itself — run **`install`** (or **`init`**) once per clone.

---

## Solo developer cheat sheet

1. **No Quorum in the repo yet** → **`quorum init`** at repo root. Commit **`config.json`** (and the Quorum gitignore block) if you want backup / another machine; keep **`local.json`** private.
2. **Repo already has committed Quorum config** (e.g. work) → clone, then **`quorum install`** once.
3. **Team default has `install_git_rewrite_hook: false` but you want rewrites tracked locally** → set **`"install_git_rewrite_hook": true`** in **`local.json`**, then **`quorum install`** (or **`init`** again).

Always: **`quorum`** on **`PATH`** if agent/Git hooks should run non-interactively.

---

## Related

- [Post-rewrite hook and rewrite manifests](post-rewrite-hook-rewrite-manifest.md) — optional local rewrite linkage.
- [Manual transcript + checkpoint](manual-transcript-checkpoint.md) — checkpoints without agent auto-capture.
