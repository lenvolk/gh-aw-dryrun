---
name: gh-aw-demo-creator
description: "Create, configure, present, and troubleshoot GitHub Agentic Workflows (gh-aw) demos using current official documentation. Use for gh-aw demos, agentic workflow Markdown, gh aw init/add-wizard/compile/run, engine authentication, COPILOT_GITHUB_TOKEN, copilot-requests, safe-outputs, workflow debugging, and designing or expanding demo agents."
---

# gh-aw Demo Creator

## Overview

Build and debug GitHub Agentic Workflows (gh-aw) demos using the authoritative gh-aw documentation as the source of truth. gh-aw is in public preview and changes frequently; do not infer its schema, authentication, or permissions from general GitHub Actions knowledge.

## Golden rule: look it up before claiming it

Before stating any gh-aw fact (secret name, scope, YAML key, CLI flag, permission), fetch the relevant doc page. The authoritative source map is in [references/authoritative-sources.md](references/authoritative-sources.md) — consult it first.

Common mistakes to avoid (all made in past sessions — see [references/troubleshooting.md](references/troubleshooting.md)):

- Claiming `COPILOT_API_KEY` when the Copilot engine actually requires `COPILOT_GITHUB_TOKEN`
- Telling users to generate a classic PAT (`ghp_…`) when the Copilot engine rejects them and requires a fine-grained PAT (`github_pat_…`)
- Requiring a PAT when organization billing through `permissions: copilot-requests: write` is available
- Listing `Copilot Chat: Read` instead of the current fine-grained PAT account permission, `Copilot Requests: Read`

When in doubt, read the compiled `.lock.yml` in the user's repo — it names the exact secret(s) it reads at runtime.

## Workflow: create a gh-aw demo from scratch

Execute these phases in order. Skip phases the user has already completed.

### Phase 1 — Verify prerequisites

Confirm the required tools without reinstalling them:

```powershell
git --version; gh --version; gh auth status; gh aw version
```

All must succeed. Python is not a gh-aw prerequisite. If `gh aw` is missing, install the current official extension with `gh extension install github/gh-aw`. For a Copilot workflow, verify either organization billing with `copilot-requests: write` or an active Copilot license for the `COPILOT_GITHUB_TOKEN` owner.

### Phase 2 — Scaffold the demo repo

1. Work from the target repository root.
2. Run `gh aw init` for first-time repository setup. Do not overwrite existing customization.
3. Prefer `gh aw add-wizard <workflow>` for a maintained gallery workflow, or create `.github/workflows/<name>.md` from the current `create.md` guidance and [references/demo-template.md](references/demo-template.md).
4. Keep each demo beat focused on one trigger and one or two visible safe outputs.

### Phase 3 — Compile

From the repo root (where `.github/` lives):

```powershell
gh aw compile
```

This generates or updates `.lock.yml` siblings for the workflow Markdown sources. Commit both source and lock files. Read the generated workflow to verify authentication, permissions, and job structure; never hand-edit `.lock.yml`.

### Phase 4 — Configure engine authentication

Look up the current authentication choices in [references/engines.md](references/engines.md). For Copilot, prefer organization billing when available:

```yaml
permissions:
  copilot-requests: write
```

This uses the per-run GitHub Actions token and requires no PAT. For personal repositories or organizations without centralized Copilot billing, configure the documented engine secret with `gh aw secrets set <EXACT_SECRET_NAME>` (or `gh secret set <EXACT_SECRET_NAME>`). Never print or pass secret values on the command line.

### Phase 5 — Commit, push, trigger

```powershell
git add . ; git commit -m "feat: add gh-aw demo" ; git push
```

Trigger the workflow through its configured event or use `gh aw run <workflow-name>` when manual dispatch is supported. Verify the run and its safe output rather than assuming a fixed completion time.

### Phase 6 — Debrief / demo

When walking an audience through the result, show in order: workflow `.md` → compiled `.lock.yml` → the triggering PR/issue/manual run → visible safe output → the actual generated job graph and audit artifacts. Do not promise a fixed five-job graph; jobs vary with the workflow and gh-aw version. The value proposition is natural-language intent, compiled automation, isolated and validated writes, and an auditable run.

## When designing a new agent (not just the reference demo)

1. Read [references/authoritative-sources.md](references/authoritative-sources.md) and fetch the `frontmatter`, `triggers`, and `safe-outputs` reference pages for the current gh-aw version.
2. Start from the official <https://github.github.com/gh-aw/gallery/> or a maintained example in <https://github.com/githubnext/agentics>; do not invent YAML keys from memory.
3. The agent `.md` has a YAML frontmatter (`on:`, `permissions:`, `engine:`, `safe-outputs:`, `tools:`) followed by the plain-English prompt.
4. Keep GitHub data permissions available during agent execution read-only. Special scopes such as `copilot-requests: write` authenticate services; repository mutations should be requested through `safe-outputs:` and performed by separate scoped jobs after validation.
5. Compile early and often — `gh aw compile` catches schema errors before push.

## When expanding this demo with new beats

For requests like "add a follow-up beat", "create another AW demo", or "make this demo more impressive", read [references/demo-expansion-playbook.md](references/demo-expansion-playbook.md) before editing files. Use it to select a public example, map the story to one clear trigger and one or two visible safe outputs, keep the audience setup small, and preserve the existing beat-by-beat walkthrough style.

## Troubleshooting entry points

When a workflow run fails, open [references/troubleshooting.md](references/troubleshooting.md) and match the exact error. Authentication, permission, compilation, tool, network, and safe-output failures occur at different stages; do not assume every failure is a missing secret.

Start with `gh aw audit <run-id>` and `gh aw logs`, then use `gh run view <run-id> --log-failed` when raw Actions logs are needed.

## Resources

- [references/authoritative-sources.md](references/authoritative-sources.md) — which gh-aw doc page answers which question
- [references/engines.md](references/engines.md) — per-engine secret names, PAT types, required permissions
- [references/troubleshooting.md](references/troubleshooting.md) — known failure modes and their fixes
- [references/demo-template.md](references/demo-template.md) — the two-beat reference demo structure (PR reviewer + issue triage)
- [references/demo-expansion-playbook.md](references/demo-expansion-playbook.md) — how to design follow-up beats and new demos from public gh-aw sources
