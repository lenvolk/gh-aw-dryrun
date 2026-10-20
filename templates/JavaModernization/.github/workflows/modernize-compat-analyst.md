---
description: Worker - read-only analysis of source compatibility for the Asset Manager upgrade. Reads the tool evidence and posts structured findings on the request issue.

on:
  workflow_call:
    inputs:
      issue_number: { type: string, required: true }
      ref: { type: string, required: true }
      stage: { type: string, required: false, default: "modernize-compat-analyst" }
  workflow_dispatch:
    inputs:
      issue_number: { description: "Modernization Request issue number", type: string, required: true }
      ref: { description: "Commit to assess (main)", type: string, required: true }
      stage: { description: "Stage name. Keeps artifact names unique per worker. Leave the default.", type: string, required: false, default: "modernize-compat-analyst" }

permissions:
  actions: read
  contents: read
  issues: read
  pull-requests: read

engine:
  id: copilot
  model: claude-haiku-5.5
  concurrency:
    group: "gh-aw-copilot-modernize-compat-analyst-${{ inputs.issue_number }}"

concurrency:
  job-discriminator: ${{ inputs.issue_number }}

imports:
  - ../agents/modernize-compat-analyst.agent.md

skills:
  - .github/skills/java-upgrade-rules
  - .github/skills/pr-description
  - .github/skills/pr
  - .github/skills/show-me

checkout:
  ref: ${{ inputs.ref }}

# The tool evidence was measured by the assessment-facts job of the calling run.
pre-agent-steps:
  - name: Download the tool evidence
    uses: actions/download-artifact@v8
    with:
      name: assessment-facts
      path: .modernize/facts

tools:
  github:
    toolsets: [issues]
  bash: ["cat", "ls", "grep", "find", "head", "tail", "wc", "sort", "uniq", "sed -n"]

safe-outputs:
  add-comment:
    target: "*"
    max: 1

timeout-minutes: 20
---

# modernize-compat-analyst

Run the `modernize-compat-analyst` agent role for this task.

- Modernization Request issue: #${{ inputs.issue_number }}
- Commit under assessment: `${{ inputs.ref }}`
- Tool evidence: `.modernize/facts/` (`facts.md`, `facts.json`, and raw tool output in `raw/`)

Post your single comment on issue #${{ inputs.issue_number }}.
