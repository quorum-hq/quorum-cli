# Security policy

The maintainers of **quorum-cli** take security reports seriously. This document describes how to report vulnerabilities, what we commit to, and what is in scope.

## Reporting a vulnerability

**Please use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)** for this repository (**Security** tab → **Report a vulnerability**).

Do **not** open a **public issue** or **public pull request** to disclose an unfixed security vulnerability. That puts users at risk and makes coordinated disclosure harder.

If you are unsure whether something counts as a security issue, report it privately anyway; we will triage and redirect if appropriate.

## What to include

Short, specific reports help us fix issues faster. Please include:

- **Version** — npm package version and output of `quorum version` (if applicable)
- **Summary** — one paragraph describing the issue
- **Steps to reproduce** — commands, config, or minimal example
- **Impact** — what an attacker could achieve (confidentiality, integrity, availability)
- **Affected surface** — e.g. CLI, hook installation, git/shadow-branch integration
- **Suggested fix** (optional)
- **Credit** — how you would like to be named in an advisory, or state if you prefer to remain anonymous

## Response and disclosure

- We aim to send an **initial acknowledgment within 5 business days** for reports that are **in scope** and **actionable**.
- We follow **coordinated disclosure**: please do not publish details until we have released a fix or we have agreed on a timeline.
- Our default expectation is **up to 90 days** from when we accept a report **or** until a fix is released, **whichever comes first**, unless we mutually agree otherwise.
- For **critical** issues, we may fix and disclose **sooner** by mutual agreement.

## Supported versions

Security fixes are provided for the following release line:

| Version | Supported for security fixes |
| ------- | ---------------------------- |
| `0.1.x` | Yes                          |

When new major or minor lines are published, this table will be updated.

## Scope

### In scope

- Vulnerabilities in **this project’s code** (CLI, hook installers, and related logic) that could lead to **unexpected code execution**, **unsafe file or command handling**, **path traversal**, **injection** when invoking configured processes, or **other integrity/confidentiality breaks** beyond what a user explicitly chose to trust.
- **Risky defaults** in quorum-cli that materially increase attack surface; we welcome good-faith reports even if severity is debatable.

### Out of scope (by default)

- Vulnerabilities in **third-party tools** you configure (e.g. coding agent CLIs, other executables).
- **User-authored** hook scripts or local modifications.
- **Social engineering**, physical access, or **compromised developer machines**.
- **Purely upstream** issues in dependencies (see [Dependency reports](#dependency-reports)); report those to the upstream maintainer when appropriate.
- **Sensitive content** inside transcripts or checkpoints as a **privacy** topic (unless the issue is that quorum-cli **unintentionally exposes** that data beyond documented behavior).

For **privacy**, data retention, or documentation questions about what the tool writes to disk, please open a **regular GitHub Issue** on this repository instead of private vulnerability reporting.

## Dependency reports

- If you believe a **transitive dependency** is vulnerable, please confirm it is present in **our published dependency tree** and describe a plausible impact on **quorum-cli** users.
- Issues that belong **only** in an upstream package should be reported **upstream**; we still track dependency updates and ship bumps in **patch releases** when needed.
- **Low-impact** or **duplicate** dependency alerts may be closed as **informational** if there is no practical exploit path in this CLI.

## Credit and advisories

- For **confirmed** vulnerabilities we fix, we will publish a **[GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories/about-github-security-advisories)** when the issue is **meaningful to users** (we may skip advisory-only noise for minor hardening with no practical impact).
- We will credit you in the advisory **unless** you request anonymity.
- We will request or accept a **CVE** for **moderate-and-above** impact or when there is a plausible **cross-user** or **supply-chain** angle; we may skip CVE noise for purely local, low-impact hardening.

We are happy to **coordinate publication timing** with you before an advisory goes public.

## Safe harbor

We support **good-faith** security research that:

- Stays within **in-scope** issues and systems you are **authorized** to test (e.g. your own repositories and machines).
- Avoids **privacy violations**, **data destruction**, sustained **denial of service**, or **social engineering**.

This section is **not legal advice** and does not replace applicable law or your agreements with third parties.

## Thank you

Responsible disclosure helps everyone who depends on quorum-cli. We appreciate your effort and patience.
