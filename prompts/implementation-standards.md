# Shared implementation guidance

Use this reference for implementation technique within the assigned scope, permissions, and authorization.
Before selecting tests or checks, read `@agent-references/verification-scope.md`.
Apply its boundary to the guidance below.

## Ground the change

- Read the target files, adjacent code, callers, and relevant tests before editing.
- Check dependency manifests, lockfiles, runtime versions, and repository instructions.
  Use documentation for the installed version. Do not assume a library or tool is available.
- Match project conventions. Reuse existing helpers where they fit the requirement.
- Make the smallest coherent change satisfying the approved task.
  Avoid unrelated cleanup, new abstractions, or dependency changes.
- Treat a research-only assignment as read-only, even if the agent has edit permission.

## Implement and verify

- For behavior or test changes, read `@agent-references/testing-standards.md` before selecting or writing coverage.
  Use the assigned testing skills within the approved scope. Report missing coverage without expanding the task.
- Preserve intended behavior, interfaces, and security boundaries. Handle relevant failure paths.
- Add or update tests when they can detect a meaningful regression.
  Use the project's existing test framework and configured checks.
- Inspect the final diff. Run checks that cover the affected behavior and integration points.
  Avoid installing or inventing tooling merely to complete a checklist.
- Distinguish failures introduced by the change from preexisting failures.
  Record checks that passed, failed, were blocked, or were not applicable.
- Do not describe an unexecuted check as passing. Include evidence for any claimed result.

## Simplify when useful

After complex or exploratory work functions, make one bounded simplification pass before final independent review.
Use what you learned to identify temporary scaffolding, duplicate logic, unnecessary state or layers,
and opportunities to reuse existing code. Change only what has a concrete benefit within the approved scope.
No change is a valid result; do not require a rewrite or repeat the pass indefinitely.
Preserve a recoverable baseline without unauthorized commits or destructive Git operations.
Preserve behavior, interfaces, security boundaries, and meaningful tests. Rerun affected checks after changes,
then review the final diff through the existing review workflow.

## Return evidence

Report changed behavior, inspected scope, source state, actual check results, and unresolved limits.
For research-only work, return source-grounded findings and do not imply implementation occurred.

Implementation evidence does not authorize a commit, push, deployment, or other external action.
Honor the task's authorization boundaries and report unmet prerequisites without expanding the assignment.
