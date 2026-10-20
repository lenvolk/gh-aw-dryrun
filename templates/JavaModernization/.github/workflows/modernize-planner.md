---
description: Stage 2 - writes the Asset Manager modernization plan from the approved assessment into the plan pull request, for human approval.

on:
  workflow_call:
    inputs:
      issue_number: { type: string, required: true }
      pr_number: { type: string, required: true }
      branch: { type: string, required: true }
      request_dir: { type: string, required: true }
      stage: { type: string, required: false, default: "modernize-planner" }
  workflow_dispatch:
    inputs:
      issue_number: { description: "Modernization Request issue number", type: string, required: true }
      pr_number: { description: "Plan pull request number", type: string, required: true }
      branch: { description: "Plan branch, for example modernize/plan-12", type: string, required: true }
      request_dir: { description: "Folder with assessment.md, for example docs/modernization/requests/12", type: string, required: true }
      stage: { description: "Stage name. Keeps artifact names unique per worker. Leave the default.", type: string, required: false, default: "modernize-planner" }

permissions:
  contents: read
  issues: read
  pull-requests: read

engine:
  id: copilot
  model: claude-sonnet-5.5
  concurrency:
    group: "gh-aw-copilot-modernize-planner-${{ inputs.issue_number }}"

concurrency:
  job-discriminator: ${{ inputs.issue_number }}

imports:
  - ../agents/modernize-planner.agent.md

skills:
  - .github/skills/java-modernization
  - .github/skills/pr-description
  - .github/skills/pr
  - .github/skills/show-me

checkout:
  ref: ${{ inputs.branch }}

tools:
  github:
    toolsets: [issues, pull_requests]
  edit:
  bash: ["cat", "ls", "grep", "find", "head", "tail", "wc", "sed -n"]

safe-outputs:
  push-to-pull-request-branch:
    target: "*"
    required-title-prefix: "[modernization-plan] "
    if-no-changes: error
    fallback-as-pull-request: false
    max: 1
  update-pull-request:
    target: "*"
    title: false
    body: true
    max: 1

timeout-minutes: 20
---

# modernize-planner

Write the modernization plan for this request. Follow the imported `modernize-planner` agent instructions.

## Context

- Modernization Request issue: #${{ inputs.issue_number }}
- Plan pull request: #${{ inputs.pr_number }} on branch `${{ inputs.branch }}`
- Request folder: `${{ inputs.request_dir }}/`. Write exactly one file: `${{ inputs.request_dir }}/plan.md`.
- Commit message: `docs: modernization plan for #${{ inputs.issue_number }}`
