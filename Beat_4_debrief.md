# Beat 4 debrief - multi-agent Java modernization with human gates

**In one sentence:** a GitHub issue became a measured assessment, then a reviewed plan, then a team of small agents upgraded a Java 8 app to Java 21 and proved it with tests, and a human approved every step.

![Who does what in Beat 4](assets/beat-4-who-does-what.svg?v=assess-first)

> Editable source: [assets/beat-4-who-does-what.excalidraw](assets/beat-4-who-does-what.excalidraw)

## What the customer just saw

| # | What happened | Who decided |
|---|---|---|
| 1 | A GitHub issue stated the outcome and the boundaries: Java 21, Spring Boot 3.5, no Azure migration. | Human |
| 2 | Standard Java tools measured the app: tests on JDK 8, dependency tree, newer versions, jdeps, jdeprscan, SpotBugs, an OpenRewrite preview, known advisories. Two read-only agents turned the facts into findings with IDs. One Assessment Report appeared on the issue. Nothing was changed. | Tools measured, agents judged |
| 3 | The human read the report and approved it. | **Gate 1** |
| 4 | A planner agent wrote the plan into a pull request next to the approved report and evidence. A check without AI confirmed every finding was owned by a step; the pipeline added a measured cost estimate. | Agent proposed, checks verified |
| 5 | The human merged the plan. | **Gate 2** |
| 6 | Agents upgraded the code on a branch, one at a time. Actions jobs built and tested on JDK 21, published a JUnit check, and re-ran SpotBugs and the advisory scan. Two reviewer agents checked the result in parallel: against the plan, and against the coding rules. | Automated and auditable |
| 7 | An Implementation Pull Request arrived with before-and-after evidence, review verdicts and the actual AI cost. | **Gate 3** |

Nothing is planned before the assessment is approved, nothing changes before the plan is merged, and nothing reaches `main` unless a human merges it.

## The pipeline

![Beat 4 pipeline](assets/beat-4-pipeline.svg?v=models)

> Editable source: [assets/beat-4-pipeline.excalidraw](assets/beat-4-pipeline.excalidraw)

Read it top to bottom in three lanes:

1. **Assess.** `assessment-facts` runs the tools, with no AI. `modernize-compat-analyst` and `modernize-dependency-analyst` read the evidence in parallel and post findings with IDs. `assessment-report` builds one report. `assessment-approval` stops the run until a human approves it.
2. **Plan.** `open-plan-pr` commits the approved report and evidence to a plan branch. `modernize-planner` writes `plan.md`. `plan-ready` validates it without AI and fills in the cost. A human merges it.
3. **Execute and validate.** `modernize-build-upgrader` changes the Maven files, then `modernize-code-fixer` changes the Java code until it builds and the tests pass. `verify-build` and `verify-static` run side by side, then `modernize-conformance-reviewer` (Spec) and `modernize-standards-reviewer` (Standards) review side by side. `finalize` reports the cost and hands over.

## What a Java developer sees at each gate

| Gate | Evidence on screen | Produced by |
|---|---|---|
| 1. Approve the assessment | Baseline tests case by case, every javax import with a permalink, `dependency:tree`, newer versions, jdeps and jdeprscan results, OSV.dev advisories by artifact, the SpotBugs baseline, the OpenRewrite preview diff, findings with IDs and ranks, decisions to confirm, cost estimate | Tools, then analyst agents |
| 2. Approve the plan | `plan.md` with each step's finding IDs and a small diff, a Finding Coverage table, Validation, Risks and Rollback, the measured cost, and a Plan validation comment | Planner agent, then checks without AI |
| 3. Review the result | Verification on JDK 21 (tests, advisories and SpotBugs before and after), the JUnit check, commits that name finding IDs, Spec traceability per finding, Standards inline comments, actual AI cost | Actions jobs, then reviewer agents |

## Meet the agents

Each agent has one name everywhere: its workflow file, its entry in the Actions sidebar, its job in the run graph, and its custom agent file.

| Agent | Reads or writes | What it produces |
|---|---|---|
| `modernize-compat-analyst` | Read-only | Source findings `C-..` from the tool evidence |
| `modernize-dependency-analyst` | Read-only | Dependency findings `D-..` and decisions per artifact |
| `modernize-planner` | Pushes one Markdown file | `plan.md`, every finding ID owned by a step |
| `modernize-build-upgrader` | Pushes a commit | Updated `pom.xml` files, commit `build(D-..)` |
| `modernize-code-fixer` | Pushes commits | Updated sources and tests, commits `fix(C-..)` |
| `modernize-conformance-reviewer` | Updates the PR description, one comment | Spec review: traceability per finding |
| `modernize-standards-reviewer` | Inline review comments, one comment | Standards review: rules and smells |

Plain Actions jobs, not agents, run the tools, the baseline and JDK 21 tests, the advisory scans, the version checks, the plan validation, the cost report and the hand-off. Where a result can be computed, it is computed. Agents handle judgment.

## Why different models, and what it costs

Each workflow pins its model in `engine.model`. All use the same Copilot engine and token; the plain Actions jobs use no model.

| Workflow | Model ID | Measured AI credits (agent + threat detection) |
|---|---|---|
| `modernize-compat-analyst` | `gpt-5.6-luna` | 3.6 |
| `modernize-dependency-analyst` | `claude-haiku-4.5` | 33.9 |
| `modernize-planner` | `claude-sonnet-5.5` | 45.9 |
| `modernize-build-upgrader` | `claude-haiku-5.5` | 2.1 |
| `modernize-code-fixer` | `claude-sonnet-5.5` | 35.6 |
| `modernize-conformance-reviewer` | `claude-sonnet-5.5` | 35.2 |
| `modernize-standards-reviewer` | `claude-sonnet-5` | 39.4 |
| **Full run** | | **195.6 credits, about $1.96** |

Measured on the full pre-run of 2026-10-19. About 30% of it is threat detection: after every agent, gh-aw checks the agent's output on the same model before anything is written. The run itself shows the actual numbers at each gate, and every gh-aw comment ends with its own credit count. These are role-based demo choices, not benchmark claims.

What the pre-run taught about models: the gh-aw integration offers a fixed list of models, and in gh-aw v0.89.21 the newest OpenAI models failed when they edited files through tools. Agents that edit files or run long tool loops use Claude; the read-only compat analyst uses a small OpenAI model. Show this to Java developers as an example of why you pre-run and read the logs.
## Why several agents instead of one

Think of it like small services instead of one monolith.

- **Faster.** Analysis, checks and reviews run in parallel.
- **Safer.** Each agent has one job and the least access it needs. Analysts and reviewers cannot change code.
- **Easier to trust.** Tools measure the facts; agents interpret them and cite the evidence.
- **Easier to track.** One finding ID runs from the report to the plan, the commit and the review. Each stage has its own job, log and row on the status board.
- **Easier to recover.** A failed stage can be re-run alone. Earlier work stays.

## Where the human stays in control

1. **Approve the Assessment Report** to authorize a plan. It is a GitHub Environment approval in the Actions run, and the report records who approved.
2. **Merge the plan** to authorize any code change.
3. **Review the Implementation Pull Request** and merge or reject it.

Along the way:

- Agents never write to the repository directly. A separate, validated job pushes their commits.
- The plan pull request stays a draft if the plan does not cover every finding.
- The Implementation PR stays a **draft** until the checks pass and both the Spec and the Standards review say PASS.

## Where the code lives

| Location | Contents |
|---|---|
| `main` | The original Java 8 / Spring Boot 2.7 code, plus the approved assessment and plan as Markdown once the plan is merged. |
| `modernize/plan-<N>` | The plan pull request branch: assessment, evidence, plan. No code. |
| `modernize/issue-<N>` | The modernized Java 21 / Spring Boot 3.5 code. |
| Implementation Pull Request | The review surface for the branch. Merging it is the only way the new code reaches `main`. |

## What if something fails

| Failure | What you see | Recovery |
|---|---|---|
| A tool step fails (OpenRewrite, OSV.dev) | The step is yellow; the report says the data is unavailable | Continue, or re-run the job |
| The assessment is wrong or out of scope | The run waits at `assessment-approval`; nothing has changed | Select Reject, fix the request, start again |
| The plan misses a finding | **Plan validation** fails; the plan pull request stays a draft | Re-run the planner, or close the pull request |
| A test fails after the upgrade | `verify-build` is red; **Verification on JDK 21** shows each test before and after | Re-run `modernize-code-fixer` |
| An agent cannot finish | That job is red; the branch keeps earlier work | Re-run the failed job from the Actions run |

## Be honest about the boundaries

- This pipeline **copies the assess, plan, execute, validate order** of GitHub Copilot app modernization. It uses our own gh-aw agents and standard Java tools. It does not run that product, and it is not a supported product feature. The product assesses a whole repository for cloud readiness with its own rule engine; this demo assesses one application for one upgrade.
- The baseline has one failing worker test (Mockito cannot mock a final AWS class on Java 8). The report lists it as a decision and the pipeline compares against it. Whether the upgrade makes it pass is a result to report, not a promise.
- The cost table is an estimate. The actual credits recorded during the run are the numbers to quote.
- Agent behavior is proven by running it. The pre-run you showed is that proof.

## What to have open on screen

1. The Modernization Request issue with its status board.
2. The `assessment-facts` job, one step per tool.
3. The Assessment Report comment.
4. The plan pull request: `plan.md` and the Plan validation comment.
5. The execution run graph, and one agent run to show a read-only job and a separate validated write.
6. The Implementation Pull Request: Verification on JDK 21, commits with finding IDs, Spec and Standards reviews, AI cost.

## Questions you may get

**Is this the Copilot app modernization product?**
No. It follows the same assess, plan, execute, validate order with gh-aw agents. The product remains the supported route for production work.

**Where do the numbers in the report come from?**
From the tools: Maven, Surefire, the versions plugin, `jdeps`, `jdeprscan`, SpotBugs, OpenRewrite and OSV.dev. Each is its own step in the `assessment-facts` job. The agents interpret the numbers; they do not produce them.

**How much does a run cost?**
About 200 AI credits, roughly $2, for all seven agents; the pre-run measured 195.6 credits. The report, the plan and the Implementation pull request show the actual credits per agent.

**Can it run without a human?**
It could. This demo deliberately keeps three gates. The approval model does not change if you add more stages.

**What if an agent is wrong?**
The tools measured the facts first, the plan validation catches a missing or invented finding, the tests run against the baseline, two reviewers check the plan and the rules separately, and a human reviews before anything reaches `main`.

**Why not one big agent?**
Parallel work, least privilege, and per-stage recovery. The same reasons teams split services.

## Customer takeaway

> We did not ask an agent to modernize production code without oversight. We captured intent, measured the application with the tools Java developers already trust, reviewed a detailed assessment before any plan, reviewed a plan that accounts for every finding before any code change, let a team of small agents do the work in parallel where it was safe, and received reviewable code with before-and-after evidence and a known cost. The next stages can be added later without changing this approval model.

## Deliberately deferred

- Azure Database for PostgreSQL migration
- Azure Blob Storage migration
- Azure Service Bus migration
- Containerization
- Azure deployment
- CI/CD quality gates
- Production observability and feedback
- Remaining advisories after the upgrade (listed in the verification comment for follow-up)