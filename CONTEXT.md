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
The human review and merge of a Modernization Plan pull request, which authorizes the implementation workflow to create an Implementation Pull Request.
_Avoid_: Validation, confirmation, approval comment

**Modernization Slice**:
The Asset Manager Java 8 to 21 and Spring Boot 2.7 to 3.5 runtime and framework upgrade, including the product's validation and fix loop.
_Avoid_: Full modernization, migration phase

**Implementation Pull Request**:
A pull request containing the approved Modernization Slice and its validation evidence.
_Avoid_: Coding-agent output, generated patch

**Beat 4**:
A standalone hybrid demo in which gh-aw manages the Modernization Request, Modernization Plan, and Plan Approval, while GitHub Copilot app modernization executes and validates the approved Modernization Slice against Asset Manager.
_Avoid_: Add-on step, Beat 3 extension

**Modernization Executor**:
The supported GitHub Copilot app modernization experience that applies the approved Modernization Slice and performs its validation and fix loop.
_Avoid_: gh-aw implementation agent, VS Code coding agent

**Checkpoint Branch**:
A product-maintained Asset Manager branch representing a known-good workshop stage for comparison, recovery, or skipping ahead.
_Avoid_: Backup branch, golden patch
