---
description: Worker - updates only the Maven build files of Asset Manager to Java 21 and Spring Boot 3.5.

on:
  workflow_call:
    inputs:
      issue_number: { type: string, required: true }
      pr_number: { type: string, required: true }
      branch: { type: string, required: true }
      plan_path: { type: string, required: true }
      stage: { type: string, required: false, default: "modernize-build-upgrader" }
  workflow_dispatch:
    inputs:
      issue_number: { description: "Modernization Request issue number", type: string, required: true }
      pr_number: { description: "Implementation pull request number", type: string, required: true }
      branch: { description: "Implementation branch", type: string, required: true }
      plan_path: { description: "Approved plan path", type: string, required: true }
      stage: { description: "Stage name. Keeps artifact names unique per worker. Leave the default.", type: string, required: false, default: "modernize-build-upgrader" }

permissions:
  contents: read
  issues: read
  pull-requests: read

engine:
  id: copilot
  model: claude-haiku-5.5
  concurrency:
    group: "gh-aw-copilot-modernize-build-upgrader-${{ inputs.issue_number }}"

concurrency:
  job-discriminator: ${{ inputs.issue_number }}

imports:
  - ../agents/modernize-build-upgrader.agent.md

skills:
  - .github/skills/java-upgrade-rules

checkout:
  ref: ${{ inputs.branch }}

runtimes:
  java:
    version: "21"

network:
  allowed: [defaults, java]

tools:
  github:
    toolsets: [pull_requests]
  edit:
  # Writers run in the gh-aw sandbox: network firewall, no credentials, and repository writes only through
  # validated safe outputs. Any shell command is allowed so Maven pipes and redirects work.
  bash: [":*"]

safe-outputs:
  push-to-pull-request-branch:
    target: "*"
    required-title-prefix: "[modernization] "
    if-no-changes: error
    protected-files: allowed
    fallback-as-pull-request: false
    max: 1

timeout-minutes: 30
---

# modernize-build-upgrader

Run the `modernize-build-upgrader` agent role for this task.

- Modernization Request issue: #${{ inputs.issue_number }}
- Implementation pull request: #${{ inputs.pr_number }} (branch `${{ inputs.branch }}`)
- Approved plan: `${{ inputs.plan_path }}`. The approved `assessment.md`, `findings.json` and `evidence/` are in the same folder.

Push your commit to pull request #${{ inputs.pr_number }}.
