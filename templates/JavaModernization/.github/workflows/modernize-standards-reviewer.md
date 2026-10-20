---
description: Worker - Standards axis review. Checks the Asset Manager upgrade diff against documented rules and a short smell baseline, with inline review comments.

on:
  workflow_call:
    inputs:
      issue_number: { type: string, required: true }
      pr_number: { type: string, required: true }
      branch: { type: string, required: true }
      plan_path: { type: string, required: true }
      stage: { type: string, required: false, default: "modernize-standards-reviewer" }
  workflow_dispatch:
    inputs:
      issue_number: { description: "Modernization Request issue number", type: string, required: true }
      pr_number: { description: "Implementation pull request number", type: string, required: true }
      branch: { description: "Implementation branch", type: string, required: true }
      plan_path: { description: "Approved plan path", type: string, required: true }
      stage: { description: "Stage name. Keeps artifact names unique per worker. Leave the default.", type: string, required: false, default: "modernize-standards-reviewer" }

permissions:
  contents: read
  issues: read
  pull-requests: read

engine:
  id: copilot
  model: claude-sonnet-5
  concurrency:
    group: "gh-aw-copilot-modernize-standards-reviewer-${{ inputs.issue_number }}"

concurrency:
  job-discriminator: ${{ inputs.issue_number }}

imports:
  - ../agents/modernize-standards-reviewer.agent.md

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
  create-pull-request-review-comment:
    target: "*"
    max: 10
  submit-pull-request-review:
    target: "*"
    allowed-events: [COMMENT]
    max: 1
  add-comment:
    target: "*"
    max: 1

timeout-minutes: 20
---

# modernize-standards-reviewer

Run the `modernize-standards-reviewer` agent role for this task.

- Modernization Request issue: #${{ inputs.issue_number }}
- Implementation pull request: #${{ inputs.pr_number }} (branch `${{ inputs.branch }}`)
- Approved plan: `${{ inputs.plan_path }}`

Post your inline comments and submit them as one `COMMENT` review on pull request #${{ inputs.pr_number }}. The review body is your Standards review summary with the verdict line.
