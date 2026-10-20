# GitHub Agentic Workflow Demo Design

This context defines the language used to design human-gated GitHub Agentic Workflow demonstrations.

## Language

**Modernization Request**:
A repository issue that states the desired Java application upgrade outcome and constraints.
_Avoid_: Business intent, upgrade prompt

**Modernization Plan**:
The file `plan.md`, written by the planner agent from an approved Assessment Report. It assigns every finding ID to one execution step and states the target versions, ordered changes, coverage, risks, validation criteria and a measured cost estimate. It is reviewed in a plan pull request next to the approved report and its evidence.
_Avoid_: Spec, assessment report

**Plan Approval**:
Gate 2. The human review and merge of a Modernization Plan pull request, after its plan validation passed. It authorizes the Modernization Pipeline to change code on the Working Branch.
_Avoid_: Validation, confirmation, approval comment

**Assessment Report**:
One report, published on the Modernization Request issue before any plan exists, that combines Tool Evidence with the read-only analysts' findings. Each finding has a stable ID (`C-..` source, `D-..` dependencies), a rank, a permalink and an owning agent. The report also lists decisions for the reviewer and the estimated AI cost. It is stored as an issue comment, on the run summary, as the `assessment` artifact, and, once approved, as `assessment.md` next to the plan.
_Avoid_: Plan, analyst comment, assessment file

**Assessment Approval**:
Gate 1. The human approval of the Assessment Report in the `modernize-assessment` run, through the required reviewer on the `assessment-review` environment. It authorizes the planner agent to write a Modernization Plan. Rejecting it stops with no change.
_Avoid_: Plan Approval, deployment approval

**Modernization Slice**:
The Asset Manager Java 8 to 21 and Spring Boot 2.7 to 3.5 runtime and framework upgrade, including its build and test validation.
_Avoid_: Full modernization, migration phase

**Implementation Pull Request**:
Gate 3. A draft pull request from the branch `modernize/issue-<N>` containing the approved Modernization Slice, its before-and-after verification, the Spec and Standards reviews and the actual AI cost. It becomes ready for review only after the verification jobs pass and both the Spec and the Standards review say PASS. `main` keeps the original code until a human merges it.
_Avoid_: Coding-agent output, generated patch

**Beat 4**:
A standalone demo that follows the assess, plan, execute, validate order: tools and read-only agents assess Asset Manager and a human approves the Assessment Report, a planner agent writes the Modernization Plan and a human merges it, a pipeline of gh-aw agents and plain Actions jobs then executes and validates the Modernization Slice, and a human reviews the Implementation Pull Request.
_Avoid_: Add-on step, Beat 3 extension, hybrid handoff

**Modernization Pipeline**:
Two GitHub Actions workflows. `modernize-assessment.yml` starts from the request issue, gathers Tool Evidence, runs the analysts, pauses for Assessment Approval, and opens the plan pull request. `modernize-pipeline.yml` starts when a Modernization Plan is merged, runs the code-writing Micro-Agents one at a time, verifies, runs both reviewers in parallel, and reports the cost. Each enforces one run per request.
_Avoid_: Executor, orchestrator agent

**Micro-Agent**:
A single-purpose gh-aw agent workflow with the least access its job needs. The seven are `modernize-compat-analyst`, `modernize-dependency-analyst`, `modernize-planner`, `modernize-build-upgrader`, `modernize-code-fixer`, `modernize-conformance-reviewer` (Spec), and `modernize-standards-reviewer` (Standards). Each name is the same for the workflow file, the Actions entry, the pipeline job, and, except for the planner, the custom agent file in `.github/agents/`.
_Avoid_: Sub-agent, worker bot

**Working Branch**:
The branch `modernize/issue-<N>` that holds the modernized code and is the shared workspace for the writing Micro-Agents, one at a time. It is separate from `main`.
_Avoid_: Feature branch, fork

**Tracker Comment**:
The single comment titled **Modernization status** on the Modernization Request issue, marked `<!-- modernize-tracker -->`. It records every stage of both workflows, the three gates, and links to each run.
_Avoid_: Status check, dashboard

**Reference Product**:
GitHub Copilot app modernization. Its assess, plan, execute, and validate order is the order of the Modernization Pipeline. The demo does not run it and does not claim to be it.
_Avoid_: Modernization Executor, underlying engine

**Checkpoint Branch**:
A product-maintained branch in the upstream Asset Manager sample (`workshop/java-upgrade`) representing a known-good upgrade. The demo does not use it. It is available only as a private presenter comparison.
_Avoid_: Backup branch, golden patch

**Tool Evidence**:
Facts about Asset Manager measured by standard tools with no AI: Surefire results on JDK 8, `mvn dependency:tree`, `versions-maven-plugin`, `jdeps`, `jdeprscan`, an OpenRewrite dry run and OSV.dev advisories. Stored as `facts.json` and committed as `evidence/` with the plan. Agents interpret it; they do not produce it.
_Avoid_: Agent analysis, scan results

**Finding ID**:
The stable identifier of one assessment finding, such as `C-03` or `D-01`. The plan assigns each ID to one step, commit messages name the IDs they address, and the Spec review traces each one.
_Avoid_: Issue number, task number

**Two-Axis Review**:
The parallel Spec and Standards reviews of the Implementation Pull Request, adapted from the `code-review` skill. Spec checks the diff against the plan and findings; Standards checks it against documented rules and a smell baseline. They are reported separately and never re-ranked.
_Avoid_: Conformance check, code review bot
