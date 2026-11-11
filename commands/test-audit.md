---
description: Audit existing unit and end-to-end tests for a feature, module, directory, or current task.
agent: code-reviewer
subtask: true
---

Perform a read-only audit with the `test-audit` skill. Do not delegate or execute commands.
Use the context below, otherwise an unambiguous current task. Without a bounded target, inventory relevant suites
and ask one focused scope question before substantive auditing.
Audit unit and end-to-end coverage by default. Honor a narrower focus such as unit tests only or E2E only.
A source path identifies behavior. Find related tests, including unchanged tests, within allowed repository scope.
Honor file restrictions and report inaccessible or unassessed areas.

Map expected behavior to actual assertions. Assess useful coverage, important gaps, misleading tests, duplication,
and reliability. Assess supplied check evidence and report needed execution to the builder.
Return the coverage map, prioritized evidence-backed findings, candidate decisions, and proposed improvements.
Stop after assessment. Do not generate tests, apply fixes, remove files, save task reports, or ship changes.

Audit context and optional focus:

$ARGUMENTS
