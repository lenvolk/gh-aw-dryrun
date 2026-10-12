---
on:
  slash_command:
    name: modernize-plan
    events: [issues, issue_comment]

permissions:
  contents: read
  issues: read
  copilot-requests: none

engine: copilot

skills:
  - .github/skills/java-modernization

safe-outputs:
  create-pull-request:
    title-prefix: "[modernization-plan] "
    draft: false
    max: 1
---

# Asset Manager Modernization Planner

Create a human-reviewable modernization plan for the Asset Manager application. This workflow plans the work; it never changes application code.

## Context

- The triggering issue is the Modernization Request.
- The application is in `asset-manager/`.
- The source baseline is Java 8 and Spring Boot 2.7.
- The approved target for this demo is Java 21 and Spring Boot 3.5.
- GitHub Copilot app modernization will execute the approved plan interactively after a human merges the plan pull request.

## Task

1. Read the triggering issue and inspect the Asset Manager Maven project.
2. Verify the current Java and Spring Boot versions from `asset-manager/pom.xml`.
3. Create exactly one file:

   `docs/modernization/requests/<issue-number>-asset-manager-java-upgrade.md`

4. Follow the plan format and scope rules in the `java-modernization` skill.
5. Request one pull request containing only that plan file.

## Pull request

- Title: `Plan Asset Manager Java modernization for #<issue-number>`
- Body:
  - Link to the triggering issue.
  - State the verified source and target versions.
  - Explain that merging this pull request is explicit human approval to run GitHub Copilot app modernization.
  - State that application code is unchanged.

## Guardrails

- Do not edit files under `asset-manager/`.
- Do not run the modernization, modify dependencies, or generate application code.
- Do not include Azure service migration, containerization, deployment, observability, or production rollout.
- Do not create more than one plan file or more than one pull request.
- If the repository is not the Asset Manager sample or its baseline cannot be verified, call `noop` and explain the mismatch.
