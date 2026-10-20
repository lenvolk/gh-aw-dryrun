---
name: gh-aw-demo-creator
description: "Create, configure, present, and troubleshoot GitHub Agentic Workflows (gh-aw) demos using current official documentation and reviewed workflow examples. Use for gh-aw demos, agentic workflow Markdown, gh aw init/add-wizard/compile/run, engine authentication, COPILOT_GITHUB_TOKEN, copilot-requests, safe-outputs, workflow debugging, and designing demo beats or staged SDLC automation."
---

# gh-aw Demo Creator

## Overview

Build and debug GitHub Agentic Workflows (gh-aw) demos using the authoritative gh-aw documentation as the source of truth. gh-aw is in public preview and changes frequently; do not infer its schema, authentication, or permissions from general GitHub Actions knowledge.

Read GitHub's [creating workflows guide](https://docs.github.com/en/copilot/how-tos/github-agentic-workflows/creating-github-agentic-workflows) for the authoring, authentication, update, and reuse sequence. Use the technical reference pages for exact schema and engine details. For examples and their fit to this repository, read [references/workflow-examples.md](references/workflow-examples.md).

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

Keep installation, upgrades, authentication, and rehearsal outside the customer session. Use a working version that supports the chosen workflow; do not require an upgrade merely because a newer release exists.

### Phase 2 — Scaffold the demo repo

1. Work from the target repository root.
2. Run `gh aw init` for first-time repository setup. Do not overwrite existing customization.
3. Review a matching example from Awesome Copilot, the gallery, or `githubnext/agentics` before choosing an import or a local adaptation. Use the creating workflows guide for the authoring sequence and [references/demo-template.md](references/demo-template.md) for this repo's existing pattern.
4. Keep each demo beat focused on one trigger and one or two visible safe outputs.

### Phase 3 — Compile

From the repo root (where `.github/` lives):

```powershell
gh aw compile
```

This generates or updates `.lock.yml` siblings for the workflow Markdown sources. Commit both source and lock files. Read the generated workflow to verify authentication, permissions, and job structure; never hand-edit `.lock.yml`.
The lock file starts with machine-readable `gh-aw-metadata` and lists the secrets and external actions it uses. Recompile after editing a workflow, as GitHub's creating workflows guide instructs, and commit the updated source and generated files.

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

Before the customer session, rehearse the complete flow in the target fork. Verify the actual comment, issue, plan PR, or code PR and prepare a previously successful run as a clearly labeled fallback. Compilation alone does not prove the demo works.

### Phase 6 — Debrief / demo

When walking an audience through the result, show in order: workflow `.md` → compiled `.lock.yml` → the triggering PR/issue/manual run → visible safe output → the actual generated job graph and audit artifacts. Do not promise a fixed five-job graph; jobs vary with the workflow and gh-aw version. The value proposition is natural-language intent, compiled automation, isolated and validated writes, and an auditable run.

Keep presenter preparation and the live walkthrough separate in `plan.md`. Name the demo-kit repository and target fork, state where each command runs, and verify the GitHub CLI target before setting secrets or creating issues and PRs. Give each standalone beat all its prerequisites without requiring earlier beats.

## When designing a new agent (not just the reference demo)

1. Read [references/authoritative-sources.md](references/authoritative-sources.md) and fetch the `frontmatter`, `triggers`, and `safe-outputs` reference pages for the current gh-aw version.
2. Select a reviewed example using [references/workflow-examples.md](references/workflow-examples.md). Check its current source against the installed compiler; do not treat an example as a schema specification.
3. The agent `.md` has a YAML frontmatter (`on:`, `permissions:`, `engine:`, `safe-outputs:`, `tools:`) followed by the plain-English prompt.
4. Keep GitHub data permissions available during agent execution read-only. Special scopes such as `copilot-requests: write` authenticate services; repository mutations should be requested through `safe-outputs:` and performed by separate scoped jobs after validation.
5. Compile early and often — `gh aw compile` catches schema errors before push.

## When expanding this demo with new beats

For requests like "add a follow-up beat", "create another AW demo", or "make this demo more impressive", read [references/demo-expansion-playbook.md](references/demo-expansion-playbook.md) before editing files. Use it to select a public example, map the story to one clear trigger and one or two visible safe outputs, keep the audience setup small, and preserve the existing beat-by-beat walkthrough style.

## Extending the demo into SDLC automation

Use the staged extension rules in [references/workflow-examples.md](references/workflow-examples.md). Define each stage's input, output, validation, and human approval before implementing it. Add one stage at a time when requested; do not build a complete pipeline merely because an example collection contains more workflows.

Keep Beat 4's current scope. Beat 4 is standalone and is driven from this kit as a **Software Factory**: the kit holds the repository catalog (`templates\catalog.json`, only nominated repositories may spend Actions minutes and AI credits), the template (`templates\JavaModernization\`: workflow `.md` files, orchestrator `.yml` files, agents, skills, scripts, and `deploy.ps1`), and the Software Factory canvas (`.github\extensions\software-factory\`). Edit the Beat 4 workflows in the template, never only in the target; Deploy copies missing files into the target fork (`JavaModernization\java-migration-copilot-samples`) and compiles them there, Update template overwrites changed files, and the agent pushes only after the presenter confirms. The workflows run in the target fork. In the canvas the token and the three gates are direct clicks that never pass through AI; Deploy, Update template, explaining the report and troubleshooting are prompts to the agent. It follows the assess, plan, execute, validate order: a `/modernize` request issue starts `modernize-assessment.yml`, where deterministic Actions steps gather tool evidence (tests, `dependency:tree`, versions, `jdeps`, `jdeprscan`, OpenRewrite dry run, OSV.dev) and read-only analyst agents post findings with stable IDs into one Assessment Report; a human approves it (Assessment Approval, gate 1); the planner agent writes `plan.md` into a plan PR next to the approved report and evidence, a deterministic check confirms every finding ID is assigned, and a human merges it (Plan Approval, gate 2); `modernize-pipeline.yml` then executes the upgrade on a `modernize/issue-<N>` branch, verifies it, runs the Spec and Standards reviewers in parallel, and opens a draft Implementation PR (gate 3). `main` keeps the original code. The pipeline copies the order of GitHub Copilot app modernization but does not run that product; never describe it as the product or as supported. Preserve all three human gates, keep facts deterministic and judgment in agents, keep parallelism to read-only workers, report cost per stage as a prediction at gate 1 (AI tokens and credits from measured token counts, runner minutes from the target's past runs or a measured baseline) and as actual against predicted at finalize (credits gh-aw records, job times), approve gate 3 with a review instead of merging, and leave later SDLC stages out of the beginner demo. Agent behavior is proven only by a real run, so require a clean pre-run before presenting.

## Troubleshooting entry points

When a workflow run fails, open [references/troubleshooting.md](references/troubleshooting.md) and match the exact error. Authentication, permission, compilation, tool, network, and safe-output failures occur at different stages; do not assume every failure is a missing secret.

Start with `gh aw audit <run-id>` and `gh aw logs`, then use `gh run view <run-id> --log-failed` when raw Actions logs are needed.
Use `gh aw health` for a repository-wide status view, `gh aw mcp inspect <workflow>` for MCP configuration problems, and `gh aw compile --validate` or `gh aw fix --write` for schema issues when those commands are available in the installed version.

## Resources

- [references/authoritative-sources.md](references/authoritative-sources.md) — which gh-aw doc page answers which question
- [references/engines.md](references/engines.md) — per-engine secret names, PAT types, required permissions
- [references/troubleshooting.md](references/troubleshooting.md) — known failure modes and their fixes
- [references/demo-template.md](references/demo-template.md) — the two-beat reference demo structure (PR reviewer + issue triage)
- [references/demo-expansion-playbook.md](references/demo-expansion-playbook.md) — how to design follow-up beats and new demos from public gh-aw sources
- [references/workflow-examples.md](references/workflow-examples.md) - reviewed Awesome Copilot examples, repository fit, and staged SDLC extension rules
