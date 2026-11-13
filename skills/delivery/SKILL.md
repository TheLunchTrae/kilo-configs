---
name: delivery
description: Use when starting issue-backed development, coordinating work across agents, or preparing, updating, or assessing readiness of a pull request.
---

# Issue and pull request delivery

Read the target repository's instructions and relevant issue/PR history first.
Apply repository exceptions and user constraints. Use the repository's established tools and conventions.
This skill grants no tools, role changes, or authorization for external actions.

## Track the work

Before implementation, reuse a matching issue or create one within the user's authorization.
Keep scope, plan, decisions, review dispositions, and useful verification evidence there so other agents can resume.
Read another agent's issue and changes before duplicating work. Preserve concurrent edits and identify remaining scope.
If issue creation is unavailable or unauthorized, report the traceability blocker before starting new implementation.
Use existing `test-first`, `test-audit`, and `verify` skills for their assigned scopes,
without duplicate test procedures.
Test observable behavior and public contracts. Reuse meaningful existing coverage; avoid tests that merely repeat
the implementation or freeze incidental wording and counts.

## Prepare the PR

Use `commit` and `push` for authorized Git operations. Open a draft against the intended base.
Write the body in this order: purpose and resulting behavior, meaningful final changes, linked issue,
brief validation and material limits. Use closing keywords only when the issue is completed by this PR.
Keep it concise and current after scope changes. Omit session links, AI attribution, work logs, and test transcripts.
Keep detailed evidence in the issue. Follow an applicable repository template without adding empty sections.

## Check the final head

Read `@agent-references/completion.md` and use the existing independent review workflow.
Have a separate reviewer inspect the final changes and supported fixes. Later changes need review of the affected scope.
Before marking ready, verify the remote head matches the reviewed source, refresh affected checks,
and inspect current CI, base changes, conflicts, and unresolved findings. Earlier evidence covers only unchanged scope.
If the head moved, reconcile it and review/check the affected changes before reporting readiness.
Report unavailable checks, their limits, and required unmet gates; do not treat absent CI as a passing run.
Hand the PR link and any prerequisites to the user. The user merges unless explicitly authorized otherwise.
Review completion does not authorize approval reviews, merges, releases, or deployment.
