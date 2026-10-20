---
name: java-upgrade-rules
description: Shared rules for the Asset Manager upgrade agents - scope, success criteria, strategy, namespace mapping, and reporting.
---

# Java Upgrade Rules (shared by all pipeline agents)

These rules are modelled on the assess, plan, execute, validate order of GitHub Copilot app modernization. Every pipeline agent follows them.

## Scope

- Work only under `asset-manager/`. Never edit `.github/`, `demo/`, `docs/`, or other sample folders.
- The approved plan file (path given in the task) is the contract. If the plan and the repository disagree, or the plan does not cover what you need, stop and report. Do not improvise.
- Target: Java 21 and Spring Boot 3.5.x. No Azure migration, containers, or deployment changes.

## Success criteria (checked by the pipeline, not by you)

- Both modules compile on JDK 21: `./asset-manager/mvnw -B -ntp -f asset-manager/pom.xml clean test-compile`.
- Tests are no worse than the approved baseline in `evidence/facts.json` (next to the plan): `./asset-manager/mvnw -B -ntp -f asset-manager/pom.xml clean test`.
- `./asset-manager/mvnw -B -ntp -f asset-manager/pom.xml -DskipTests package` produces both module jars.
- No `javax.persistence`, `javax.annotation`, `javax.servlet`, or `javax.validation` imports remain.

## Strategy

- Minimal changes: change only what the target versions require.
- Use the Maven Wrapper and always run it from the repository root as `./asset-manager/mvnw ... -f asset-manager/pom.xml` (the shell allowlist permits only the `./asset-manager/mvnw` form, so do not `cd`; without `-f` Maven finds no POM at the root). It needs Maven 3.9.x for JDK 21 and Spring Boot 3.5.
- Prefer a compatible successor dependency over an adapter, and an adapter over a code rewrite.
- Let the Spring Boot 3.5 BOM manage versions. Pin a version only when the BOM does not manage it.
- Never remove a version override that looks CVE-driven (nearby CVE comment, or a version newer than the BOM) without recording why.

## Namespace mapping (Jakarta EE)

| From | To |
|---|---|
| `javax.persistence.*` | `jakarta.persistence.*` |
| `javax.annotation.PostConstruct`, `PreDestroy` | `jakarta.annotation.*` |
| `javax.servlet.*` | `jakarta.servlet.*` |
| `javax.validation.*` | `jakarta.validation.*` |

`javax.imageio.*`, `javax.xml.*`, `javax.crypto.*` and other `javax` packages that ship in the JDK stay unchanged.

## Reporting

- Each agent ends with exactly one visible safe output, as its task describes.
- Quote real command output. Never claim a build or test passed unless you ran it and saw it pass.
- If a command fails and you cannot fix it within the attempts allowed by your task, say so plainly and stop. Do not hide failures.
