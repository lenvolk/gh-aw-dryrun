# GitHub Agentic Workflow Demo Design

This context defines the language used to design human-gated GitHub Agentic Workflow demonstrations.

## Language

**Modernization Request**:
A repository issue that states the desired Java application upgrade outcome and constraints.
_Avoid_: Business intent, upgrade prompt

**Modernization Plan**:
A Markdown proposal produced from a Modernization Request that describes the assessed current state, target state, impacts, ordered changes, risks, and validation criteria.
_Avoid_: Spec, assessment report

**Plan Approval**:
The human review and merge of a Modernization Plan pull request, which authorizes the Modernization Pipeline to start its read-only assessment. It does not authorize any code change.
_Avoid_: Validation, confirmation, approval comment

**Assessment Report**:
One report, published on the draft Implementation Pull Request before any code changes, that combines the baseline test result with the read-only analysts' findings: what will change, in which files and dependencies, and how. It is stored as a pull request comment, on the run summary, and as the `assessment-report` artifact.
_Avoid_: Plan, analyst comment, assessment file

**Assessment Approval**:
The human approval of the Assessment Report in the Actions run, through the required reviewer on the `assessment-review` environment. It authorizes the code-writing agents to start. Rejecting it stops the pipeline with no application change.
_Avoid_: Plan Approval, deployment approval

**Modernization Slice**:
The Asset Manager Java 8 to 21 and Spring Boot 2.7 to 3.5 runtime and framework upgrade, including its build and test validation.
_Avoid_: Full modernization, migration phase

**Implementation Pull Request**:
A draft pull request from the branch `modernize/issue-<N>` containing the approved Modernization Slice and its validation evidence. It becomes ready for review only after the verification jobs pass. `main` keeps the original code until a human merges it.
_Avoid_: Coding-agent output, generated patch

**Beat 4**:
A standalone demo in which gh-aw plans a modernization, a human approves the plan, read-only agents assess the code and a human approves the Assessment Report, a pipeline of gh-aw agents and plain Actions jobs then executes and validates the Modernization Slice against Asset Manager, and a human reviews the Implementation Pull Request.
_Avoid_: Add-on step, Beat 3 extension, hybrid handoff

**Modernization Pipeline**:
The GitHub Actions workflow `modernize-pipeline.yml` that starts when a Modernization Plan is merged. It orchestrates the Micro-Agents and deterministic jobs, pauses for Assessment Approval before any code changes, and enforces one run per request.
_Avoid_: Executor, orchestrator agent

**Micro-Agent**:
A single-purpose gh-aw agent workflow, defined by a custom agent file in `.github/agents/`, with the least access its job needs. The five are `modernize-compat-analyst`, `modernize-dependency-analyst`, `modernize-build-upgrader`, `modernize-code-fixer`, and `modernize-conformance-reviewer`. Each name is the same for the workflow file, the Actions entry, the pipeline job, and the custom agent.
_Avoid_: Sub-agent, worker bot

**Working Branch**:
The branch `modernize/issue-<N>` that holds the modernized code and is the shared workspace for the writing Micro-Agents, one at a time. It is separate from `main`.
_Avoid_: Feature branch, fork

**Tracker Comment**:
The single pull request comment, marked `<!-- modernize-tracker -->`, that records each pipeline stage's status and the baseline test result.
_Avoid_: Status check, dashboard

**Reference Product**:
GitHub Copilot app modernization. Its assess, plan, execute, and validate pattern inspired the Modernization Pipeline. The demo does not run it and does not claim to be it.
_Avoid_: Modernization Executor, underlying engine

**Checkpoint Branch**:
A product-maintained branch in the upstream Asset Manager sample (`workshop/java-upgrade`) representing a known-good upgrade. The demo does not use it. It is available only as a private presenter comparison.
_Avoid_: Backup branch, golden patch
