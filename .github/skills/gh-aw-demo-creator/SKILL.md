---
name: gh-aw-demo-creator
description: "Create, configure, and troubleshoot GitHub Agentic Workflows (gh-aw) demos end-to-end using the official gh-aw reference docs as the source of truth. WHEN: \"gh-aw demo\", \"agentic workflow\", \"gh aw compile\", \"COPILOT_GITHUB_TOKEN\", \"agent.md\", \"safe-outputs\", \"Big-O Auditor\", \"issue triage agent\", \"design new gh-aw agent\", \"debug gh-aw run\"."
license: MIT
metadata:
  version: "1.1"
---

# gh-aw Demo Creator

## Overview

Build and debug GitHub Agentic Workflows (gh-aw) demos using the authoritative gh-aw reference docs as the source of truth. gh-aw is new, its schema changes between releases, and general GitHub knowledge is not sufficient — pattern-matching from Actions experience produces wrong secret names, wrong PAT types, and wrong permissions.

## Golden rule: look it up before claiming it

Before stating any gh-aw fact (secret name, scope, YAML key, CLI flag, permission), fetch the relevant doc page. The authoritative source map is in [references/authoritative-sources.md](references/authoritative-sources.md) — consult it first.

Common mistakes to avoid (all made in past sessions — see [references/troubleshooting.md](references/troubleshooting.md)):

- Claiming `COPILOT_API_KEY` when the Copilot engine actually requires `COPILOT_GITHUB_TOKEN`
- Telling users to generate a classic PAT (`ghp_…`) when the Copilot engine rejects them and requires a fine-grained PAT (`github_pat_…`)
- Listing a `Copilot: Read` account permission (doesn't exist) instead of the real one (`Copilot Chat: Read`)

When in doubt, read the compiled `.lock.yml` in the user's repo — it names the exact secret(s) it reads at runtime.

## Workflow: create a gh-aw demo from scratch

Execute these phases in order. Skip phases the user has already completed.

### Phase 1 — Verify prerequisites

Confirm (do not re-install) the following in a single PowerShell one-liner:

```powershell
git --version; gh --version; gh auth status; python --version; gh aw --help | Select-Object -First 1
```

All must succeed. Also confirm Copilot subscription is active at <https://github.com/settings/copilot>. If `gh aw` is missing: `gh extension install githubnext/gh-aw`.

### Phase 2 — Scaffold the demo repo

1. User creates an empty GitHub repo on github.com (no README, no .gitignore, no license).
2. User clones it locally.
3. Copy template files into the new repo: two agent markdown files under `.github/workflows/`, a `src/main.py` starter, `.gitignore`, and `README.md`. The two-beat pattern (PR reviewer + issue triage) is the reference demo because it shows two triggers and two safe-output types with one compile step.

### Phase 3 — Compile

From the repo root (where `.github/` lives):

```powershell
gh aw compile
```

This generates `.lock.yml` siblings for every `.md` in `.github/workflows/`. The `.lock.yml` is the hardened Actions workflow — read it to see the exact secret names, permissions, and job graph. Never hand-edit `.lock.yml`.

### Phase 4 — Configure the engine secret

Look up the exact secret name and PAT requirements for the selected engine in [references/engines.md](references/engines.md). Do not guess. Then:

```powershell
gh secret set <EXACT_SECRET_NAME>
```

### Phase 5 — Commit, push, trigger

```powershell
git add . ; git commit -m "feat: add gh-aw demo" ; git push
```

Trigger the workflow by creating a PR (for `on: pull_request`) or filing an issue (for `on: issues`). Wait 2-3 min, then verify the agent posted its safe-output (comment, label, etc.).

### Phase 6 — Debrief / demo

When walking an audience through the result, show in order: agent `.md` → compiled `.lock.yml` → the PR/issue with the agent's output → the Actions run's 5-job graph (`activation → agent → detection → safe_outputs → conclusion`) → optional artifacts (conversation log, detection scan). The value proposition: plain-English input, hardened YAML output, gated writes, full audit trail.

## When designing a new agent (not just the reference demo)

1. Read [references/authoritative-sources.md](references/authoritative-sources.md) and fetch the `frontmatter`, `triggers`, and `safe-outputs` reference pages for the current gh-aw version.
2. Start from an existing example in <https://github.com/githubnext/agentics> — do not invent YAML keys from memory.
3. The agent `.md` has a YAML frontmatter (`on:`, `permissions:`, `engine:`, `safe-outputs:`, `tools:`) followed by the plain-English prompt.
4. `permissions:` in the frontmatter applies to the **agent job only** — it is intentionally read-only in most demos. Writes happen in the separate `safe_outputs` job, scoped per safe-output type.
5. Compile early and often — `gh aw compile` catches schema errors before push.

## When expanding this demo with new beats

For requests like "add a follow-up beat", "create another AW demo", or "make this demo more impressive", read [references/demo-expansion-playbook.md](references/demo-expansion-playbook.md) before editing files. Use it to select a public example, map the story to one clear trigger and one or two visible safe outputs, keep the audience setup small, and preserve the existing beat-by-beat walkthrough style.

## Troubleshooting entry points

When a workflow run fails, open [references/troubleshooting.md](references/troubleshooting.md) and match on the error text. The most common failures are secret-name mismatches and wrong PAT types — both surface in the `activation` job log with clear error messages.

Always recommend `gh run view <run-id> --log-failed` to get the authoritative error before speculating on causes.

## Resources

- [references/authoritative-sources.md](references/authoritative-sources.md) — which gh-aw doc page answers which question
- [references/engines.md](references/engines.md) — per-engine secret names, PAT types, required permissions
- [references/troubleshooting.md](references/troubleshooting.md) — known failure modes and their fixes
- [references/demo-template.md](references/demo-template.md) — the two-beat reference demo structure (PR reviewer + issue triage)
- [references/demo-expansion-playbook.md](references/demo-expansion-playbook.md) — how to design follow-up beats and new demos from public gh-aw sources
