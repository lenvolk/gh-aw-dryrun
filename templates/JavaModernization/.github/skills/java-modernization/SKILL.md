---
name: java-modernization
description: Produce a detailed, reviewable Java and Spring Boot modernization plan for the Asset Manager demo from an approved assessment report. Planning only.
---

# Asset Manager Java Modernization Planning

Use this skill only to **plan** the Asset Manager runtime and framework upgrade. The plan is written after a human approved the assessment report (gate 1). A human approves the plan by merging its pull request (gate 2). The pipeline in `.github/workflows/modernize-pipeline.yml` then executes it with dedicated agents.

The order follows GitHub Copilot app modernization: assess, plan, execute in small steps, validate. This repository mimics that order with its own gh-aw agents and standard Java tools. It does not run that product.

## Source of truth

- The approved assessment: `assessment.md` and `findings.json` in the request folder. Every finding has an ID such as `C-03` (source compatibility) or `D-02` (dependencies).
- Tool evidence in `evidence/`: tests, dependency tree, jdeps, OpenRewrite preview, OSV.dev advisories.
- Application: `asset-manager/` (modules `web` and `worker`, Maven Wrapper in `asset-manager/mvnw`).
- Target: Java 21 and the Spring Boot 3.5.x version the assessment recommends.

Repository and evidence take precedence over assumptions. If they disagree with the request, record a blocker in the plan instead of inventing a path.

## Plan format

Write one Markdown file with exactly these `##` sections, in this order. A deterministic check rejects the plan if a section is missing or a finding ID is not assigned.

1. `# Asset Manager Java Modernization Plan`
2. `## Request`: issue reference, business outcome, link to `assessment.md`, and who approved the assessment (from the report's status line).
3. `## Run Parameters`: one fenced `yaml` block that the pipeline agents read:

   ```yaml
   issue: <issue-number>
   project: asset-manager
   source: { java: 8, spring-boot: "<current version>" }
   target: { java: 21, spring-boot: "<exact 3.5.x version>" }
   maven-wrapper: "<target Maven version or keep>"
   ```

4. `## Assessment Summary`: the key numbers (classes, tests at baseline with the failing test named, javax imports, jdeps artifacts, advisories, findings by rank) in a short table, then a Mermaid `pie` of findings by rank. If the assessment has reviewer notes from gate 1, add a `### Reviewer notes` subsection that answers each note: followed, or not followed with the evidence that contradicts it.
5. `## Scope`: in scope, then out of scope (Azure service migration, containerization, deployment, CI/CD, observability, production rollout, Spring Boot 4).
6. `## Execution Plan`: a Mermaid `flowchart LR` of the steps, then exactly these four `###` subsections, with these headings:
   - `### Step 1 - modernize-build-upgrader`: POM files and Maven Wrapper only.
   - `### Step 2 - modernize-code-fixer`: Java sources and tests, in a build and test loop.
   - `### Step 3 - verification`: deterministic checks, no AI: JDK 21 build and tests against the baseline, version and namespace checks, OSV.dev re-scan.
   - `### Step 4 - review`: `modernize-conformance-reviewer` (spec) and `modernize-standards-reviewer` (standards), in parallel.

   In Step 1 and Step 2 list: the finding IDs the step owns, the files it may change, the exact changes in a small `diff` block (versions, imports, class signatures), the commit message pattern (`build(D-01,D-02): ...`, `fix(C-03): ...`), and "Done when". Every finding that is not ranked `No change` appears in exactly one of Step 1 or Step 2. Do not repeat finding IDs in Step 3 or Step 4; refer to "all findings" instead.
7. `## Finding Coverage`: one table with exactly one row per finding ID in `findings.json`, including `No change` findings, and these columns:

   ```markdown
   | ID | Rank | Finding | Step | Agent | Verified by |
   |---|---|---|---|---|---|
   | D-01 | Blocker | Spring Boot parent 2.7.18 to 3.5.16 | Step 1 | modernize-build-upgrader | verify-static |
   | C-04 | No change | javax.imageio stays, it ships with the JDK | none | none | verify-static |
   ```

   `Agent` is `modernize-build-upgrader`, `modernize-code-fixer`, or `none` for `No change`. `Verified by` names the check that proves it: `verify-build`, `verify-static`, or the Spec review.
8. `## Validation`: baseline captured first (exact totals and the failing test), JDK 21 build of both modules, tests no worse than baseline, both jars package, no remaining `javax.persistence|annotation|servlet|validation` imports, versions match the Run Parameters, OSV advisories after the upgrade reported against the baseline. Never assume the baseline tests are green.
9. `## Risks and Rollback`: a table with risk, likelihood, impact, mitigation and related finding IDs. Cover the `Watch` findings and the modules without tests. Then rollback: every stage can be re-run; nothing reaches `main` until a human merges the Implementation pull request; closing that pull request and deleting its branch undoes the run.
10. `## Cost Estimate`: write only `Filled in by the pipeline.` The pipeline replaces it with the measured estimate.
11. `## Approval Checklist`: checkboxes for the human who merges this plan: targets, scope, every Blocker owned, risks accepted, cost accepted.

Keep it reviewable in ten minutes: tables and diagrams over prose.

## Visuals

Follow the `pr-description` skill for Mermaid: quote every label, write "issue 12" not "#12". Use at most one diagram per section.

## Boundaries

- Planning only. Never edit `asset-manager/`.
- Never edit the approved `assessment.md`, `findings.json` or `evidence/`.
- Do not include hand-written application code beyond the small `diff` blocks that show versions, imports and signatures.
- `javax.imageio.*` and other JDK `javax` packages stay. Never plan to rename them.
- Do not expand into Azure migration, containers, or deployment.
