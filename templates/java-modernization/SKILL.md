---
name: java-modernization
description: Produce a reviewable Java and Spring Boot modernization plan for the Asset Manager demo.
---

# Asset Manager Java Modernization Planning

Use this skill only to plan the Asset Manager runtime and framework upgrade. The supported GitHub Copilot app modernization experience performs the implementation after a human approves the plan.

## Source of truth

- Application: `asset-manager/`
- Baseline: read `asset-manager/pom.xml`; expect Java 8 and Spring Boot 2.7.x.
- Demo target: Java 21 and Spring Boot 3.5.x.
- Product workshop: `asset-manager/README.md`.
- Known-good checkpoint: upstream branch `workshop/java-upgrade`.

Repository evidence takes precedence over assumptions. If the baseline differs, record the difference as a blocker instead of inventing an upgrade path.

## Plan format

Create one Markdown file with these sections:

1. `# Asset Manager Java Modernization Plan`
2. `## Request` - issue reference and business outcome.
3. `## Verified Baseline` - Java version, Spring Boot version, modules, build tool, and tests found.
4. `## Approved Target` - Java 21 and Spring Boot 3.5.x.
5. `## In Scope` - runtime/framework upgrade and required compatibility changes.
6. `## Out of Scope` - Azure service migrations, custom skills, containerization, deployment, CI/CD, and observability.
7. `## Expected Impact` - dependencies, namespaces/APIs, configuration, tests, and build files likely to change.
8. `## Execution Steps` - ordered steps for GitHub Copilot app modernization.
9. `## Validation` - baseline result capture, Maven build, automated tests, CVE validation, consistency validation, and completeness validation. Never assume the baseline tests are green.
10. `## Risks and Recovery` - identified risks and use of `workshop/java-upgrade` as a comparison or fallback.
11. `## Human Approval Checklist` - verify scope, targets, exclusions, and validation before merge.
12. `## Execution Handoff` - state that merging the plan authorizes a human operator to launch the supported modernization product.

Keep the plan concise enough to review in five minutes. Cite repository paths for every baseline claim.

## Boundaries

- Planning only. Never edit `asset-manager/`.
- Do not prescribe hand-written code changes.
- Do not claim that gh-aw invokes the VS Code extension or Copilot CLI automatically.
- Do not expand into later workshop stages.
