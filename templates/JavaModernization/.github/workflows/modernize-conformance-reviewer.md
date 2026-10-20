---
description: Worker - Spec axis review. Traces every approved finding ID to the Asset Manager upgrade diff and writes the pull request summary.

on:
  workflow_call:
    inputs:
      issue_number: { type: string, required: true }
      pr_number: { type: string, required: true }
      branch: { type: string, required: true }
      plan_path: { type: string, required: true }
      stage: { type: string, required: false, default: "modernize-conformance-reviewer" }
  workflow_dispatch:
    inputs:
      issue_number: { description: "Modernization Request issue number", type: string, required: true }
      pr_number: { description: "Implementation pull request number", type: string, required: true }
      branch: { description: "Implementation branch", type: string, required: true }
      plan_path: { description: "Approved plan path", type: string, required: true }
      stage: { description: "Stage name. Keeps artifact names unique per worker. Leave the default.", type: string, required: false, default: "modernize-conformance-reviewer" }

permissions:
  contents: read
  issues: read
  pull-requests: read

engine:
  id: copilot
  model: claude-sonnet-5.5
  concurrency:
    group: "gh-aw-copilot-modernize-conformance-reviewer-${{ inputs.issue_number }}"

concurrency:
  job-discriminator: ${{ inputs.issue_number }}

imports:
  - ../agents/modernize-conformance-reviewer.agent.md

skills:
  - .github/skills/modernization-review
  - .github/skills/java-upgrade-rules
  - .github/skills/pr-description
  - .github/skills/pr
  - .github/skills/show-me

checkout:
  ref: ${{ inputs.branch }}
  fetch-depth: 0
  fetch: ["main"]

tools:
  github:
    toolsets: [pull_requests]
  bash: ["cat", "ls", "grep", "find", "head", "tail", "wc", "git diff", "git log", "git show"]

safe-outputs:
  update-pull-request:
    target: "*"
    title: false
    body: true
    max: 1
  add-comment:
    target: "*"
    max: 1

timeout-minutes: 20
---

# modernize-conformance-reviewer

Run the `modernize-conformance-reviewer` agent role for this task.

- Modernization Request issue: #${{ inputs.issue_number }}
- Implementation pull request: #${{ inputs.pr_number }} (branch `${{ inputs.branch }}`)
- Approved plan: `${{ inputs.plan_path }}`. The approved `assessment.md`, `findings.json` and `evidence/` are in the same folder.

Update the description of pull request #${{ inputs.pr_number }} and post your single Spec review comment on it.
