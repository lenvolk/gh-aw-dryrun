import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStages, isSafeUrl, parseAtAGlance, parseCostJson, parseTracker, stageProgress, validateRequest, validateToken } from "../state.mjs";

// Status board of the issue 35 pre-run (2026-10-20), trimmed to the parts the parser reads.
const TRACKER = `<!-- modernize-tracker -->
## Modernization status

15 of 16 stages done. Three human gates: approve the assessment, approve the plan (merge the plan pull request), review the Implementation pull request.

| Phase | Stage | Status | Detail |
|---|---|---|---|
| Request | Request received | ✅ done | Started by @lenvolk on commit fd0a5a6 |
| Assess | Baseline and tool evidence | ✅ done | 10 javax imports, 4 baseline tests, 7 jdeps artifacts, 169 known vulnerabilities, 9 SpotBugs findings, preview=yes |
| Assess | Compatibility analysis | ✅ done | Comment from modernize-compat-analyst |
| Assess | Dependency analysis | ✅ done | Comment from modernize-dependency-analyst |
| Assess | Assessment report | ✅ done | 25 findings with IDs. See the Assessment report comment |
| Gate 1 | Assessment approval | ✅ done | Approved by lenvolk |
| Plan | Plan drafted | ✅ done | Plan pull request #36 [link](https://github.com/lenvolk/java-migration-copilot-samples/pull/36) |
| Plan | Plan validation | ✅ done | All findings assigned, required sections present |
| Gate 2 | Plan approval | ✅ done | Plan pull request #36 merged by @lenvolk |
| Execute | Build upgrade | ✅ done | Commit build(D-..) pushed by modernize-build-upgrader |
| Execute | Code fixes | ✅ done | Commits fix(C-..) pushed by modernize-code-fixer |
| Verify | Build and test verification | ✅ done | JDK 21: 7 tests, 0 failures, 0 errors. Baseline: 4 tests, 0 failures, 1 error. Advisories 169 -> 43. |
| Verify | Static checks | ✅ done | Spring Boot 3.5.16, Java 21, no Jakarta-bound javax imports left |
| Review | Spec review | ✅ done | Verdict: PASS. modernize-conformance-reviewer |
| Review | Standards review | ✅ done | Verdict: PASS. modernize-standards-reviewer |
| Gate 3 | Human review | ⚠️ attention | Ready: review pull request #37 and merge when satisfied |

Workflow runs:

- Run: Assessment and plan: https://github.com/lenvolk/java-migration-copilot-samples/actions/runs/39362227833
- Run: Execution: https://github.com/lenvolk/java-migration-copilot-samples/actions/runs/39369807223
`;

test("parseTracker reads rows, counts and run links", () => {
    const t = parseTracker(TRACKER);
    assert.equal(t.rows.length, 16);
    assert.equal(t.done, 15);
    assert.equal(t.total, 16);
    assert.equal(t.rows.find((r) => r.stage === "Human review").status, "attention");
    assert.match(t.rows.find((r) => r.stage === "Plan drafted").detail, /\[link\]/);
    assert.equal(t.runs.assessment.id, 39362227833);
    assert.equal(t.runs.execution.id, 39369807223);
    assert.equal(parseTracker("no marker"), null);
});

test("buildStages maps the finished pre-run to done stages with gate 3 waiting", () => {
    const tracker = parseTracker(TRACKER);
    const implPr = { number: 37, state: "open", draft: false };
    const stages = buildStages({ issue: { number: 35 }, tracker, planPr: { state: "closed", merged: true }, implPr });
    const by = Object.fromEntries(stages.map((s) => [s.key, s]));
    assert.deepEqual(stages.map((s) => s.key), ["request", "assessment", "gate1", "plan", "gate2", "execution", "gate3"]);
    for (const k of ["request", "assessment", "gate1", "plan", "gate2", "execution"]) assert.equal(by[k].status, "done", k);
    assert.equal(by.assessment.percent, 100);
    assert.equal(by.gate3.status, "attention");
    const approved = buildStages({ issue: { number: 35 }, tracker, planPr: { merged: true }, implPr, implApproved: true });
    assert.equal(approved.find((s) => s.key === "gate3").status, "done");
});

test("buildStages: gate 1 needs a pending deployment, and jobs move a stage before the board does", () => {
    const jobs = [
        { name: "prepare", status: "completed", conclusion: "success", started_at: "2026-10-20T03:00:00Z", completed_at: "2026-10-20T03:01:00Z", steps: [] },
        { name: "assessment-facts", status: "in_progress", started_at: "2026-10-20T03:01:00Z", steps: [{ name: "a", status: "completed" }, { name: "Dependency tree", status: "in_progress" }, { name: "c", status: "queued" }, { name: "d", status: "queued" }] },
    ];
    const s = buildStages({ issue: { number: 1 }, tracker: null, assessmentJobs: jobs, now: Date.parse("2026-10-20T03:03:00Z") });
    const a = s.find((x) => x.key === "assessment");
    assert.equal(a.status, "running");
    assert.ok(a.percent > 0 && a.percent < 100);
    assert.equal(a.jobs.find((j) => j.name === "assessment-facts").step, "Dependency tree");
    assert.equal(a.elapsedMs, 3 * 60 * 1000);
    assert.equal(s.find((x) => x.key === "gate1").status, "pending");
    const waiting = buildStages({ issue: { number: 1 }, tracker: null, pendingGate: { environment: { id: 1 } } });
    assert.equal(waiting.find((x) => x.key === "gate1").status, "attention");
});

test("stageProgress counts an agent call as six gh-aw jobs and flags failures", () => {
    const agent = (sub, status, conclusion) => ({ name: `modernize-code-fixer / ${sub}`, status, conclusion, started_at: "2026-10-20T04:00:00Z", completed_at: status === "completed" ? "2026-10-20T04:01:00Z" : null, steps: [] });
    const half = stageProgress([agent("pre_activation", "completed", "success"), agent("activation", "completed", "success"), agent("agent", "in_progress")], "execution");
    const fixer = half.items.find((i) => i.name === "modernize-code-fixer");
    assert.equal(fixer.status, "running");
    assert.ok(fixer.fraction > 0.3 && fixer.fraction < 0.5);
    const done = stageProgress([agent("agent", "completed", "success"), agent("conclusion", "completed", "success")], "execution");
    assert.equal(done.items.find((i) => i.name === "modernize-code-fixer").fraction, 1);
    const failed = stageProgress([{ name: "verify-build", status: "completed", conclusion: "failure", html_url: "https://github.com/x/y/actions/runs/1/job/2", steps: [] }], "execution");
    assert.equal(failed.items.find((i) => i.name === "verify-build").status, "failed");
    const stages = buildStages({ issue: { number: 1 }, tracker: null, executionJobs: [{ name: "verify-build", status: "completed", conclusion: "failure", started_at: "2026-10-20T04:00:00Z", steps: [] }] });
    assert.equal(stages.find((s) => s.key === "execution").status, "failed");
});

test("parseCostJson reads the hidden block written by modernize_cost.py, including the -- escape", () => {
    const data = { version: 1, run: "39362227833", rate: 0.006, private: false, note: "a--b", stages: { plan: { minutes: 12 } } };
    const body = "## Predicted\n\n<!-- modernize-cost-json:predicted " + JSON.stringify(data).replace(/--/g, "-\\u002d") + " -->\n";
    assert.equal(body.includes("a--b"), false);
    assert.deepEqual(parseCostJson(body, "predicted"), data);
    assert.equal(parseCostJson(body, "actual"), null);
    assert.equal(parseCostJson("<!-- modernize-cost-json:actual {broken -->", "actual"), null);
});

test("parseAtAGlance reads the measures table", () => {
    const body = "## At a glance\n\n| Measure | Now | Target or result | Source |\n|---|---|---|---|\n| Java | **8** | 21 | `pom.xml` |\n| Findings | 11 blocker | each one owned | [agents](https://x) |\n\nnext";
    assert.deepEqual(parseAtAGlance(body), [
        { measure: "Java", now: "8", target: "21" },
        { measure: "Findings", now: "11 blocker", target: "each one owned" },
    ]);
});

test("validateRequest requires /modernize at the start", () => {
    assert.equal(validateRequest("/modernize I inherited this app").ok, true);
    assert.equal(validateRequest("  /modernize\nBring it to Java 21").ok, true);
    assert.equal(validateRequest("please /modernize").ok, false);
    assert.equal(validateRequest("/modernizer").ok, false);
    assert.equal(validateRequest("").ok, false);
});

test("validateToken accepts only fine-grained PATs", () => {
    assert.equal(validateToken("github_pat_11ABCDEF0123456789_abcdef").ok, true);
    assert.match(validateToken("ghp_abc").error, /classic/);
    assert.equal(validateToken("token").ok, false);
    assert.equal(validateToken("github_pat_abc def").ok, false);
});

test("isSafeUrl allows only GitHub https links", () => {
    assert.equal(isSafeUrl("https://github.com/lenvolk/java-migration-copilot-samples/pull/37"), true);
    assert.equal(isSafeUrl("https://docs.github.com/en/billing"), true);
    assert.equal(isSafeUrl("http://github.com/x"), false);
    assert.equal(isSafeUrl("https://github.com.evil.example/x"), false);
    assert.equal(isSafeUrl("file:///C:/Windows"), false);
    assert.equal(isSafeUrl("javascript:alert(1)"), false);
});
