---
name: verify
description: Run configured checks and report source-linked PASS, FAIL, BLOCKED, or SKIP evidence without fixes.
---

# Verify

Verify evidence within assigned scope and permissions. Do not expand roles, edit application code, or apply fixes.
Commands may produce normal build artifacts; inspect side effects and retain permission checks.
Read `@agent-references/verification-scope.md` before discovery or execution. Apply explicit limits to every step below.
When all agent verification is excluded, report the limitation without inspecting capabilities or running checks.

1. Inspect project instructions, manifests, and configured scripts. Confirm the installed toolchain when available.
2. Record source state and working directory, including relevant dirty/untracked changes, not just Git HEAD.
3. Run the smallest relevant acceptance check first. Then run configured type, lint, unit, integration, and build
   checks within the agreed scope.
   Use project ordering where required. Independent read-only checks can run in parallel if outputs cannot conflict.
4. Bound commands and diagnostics. Report timeouts and missing access; never retry indefinitely.
5. Record each command, status, available exit code, and useful evidence such as test count or artifact path.
6. Inspect coverage only when configured. Compare with the project's actual policy; do not invent an 80 percent gate.
7. Report CI separately when available. Local checks do not prove CI success, native configuration loading, or UX
   behavior.
8. Invalidate affected results when source, dependencies, generated inputs, or configuration change.

## Reuse verification suites

Inspect existing verification tests and setup. Map requested scope or changed behavior, including affected integration
paths, to actual assertions. Reuse applicable coverage on current source. A passing baseline supports only exercised
contracts, not uncovered behavior or another environment.

Separate coverage gaps and follow-up from command results. Report test-generation needs for a separate
`verification-tests` implementation assignment. Do not generate tests, fix code, or install a
harness during verification.
Changed requirements need reviewed expectations before tests can verify them.

## Results

| Status | Meaning |
| --- | --- |
| PASS | The check ran on the stated source state and satisfied its actual acceptance conditions. |
| FAIL | The check ran and found a relevant failure. Distinguish pre-existing failures from regressions. |
| BLOCKED | A required check could not finish because environment, permission, or access is missing. |
| SKIP | The check does not apply, is not configured, or is explicitly excluded. State why. This is not a pass. |

For an exclusion, identify the decision source and unverified scope. Preserve earlier attempts and failures.
Apply accepted conditional exclusions without another approval request.
Other unavailable required checks remain `BLOCKED`.

Zero exit status with no expected tests collected does not prove acceptance.
Do not invent a runner or install packages to hide missing configuration.
Do not suppress warnings or weaken assertions. Record warnings against the project's policy.
Report action items for the implementer. A verification report does not authorize edits or remote actions.
Include these check statuses, source state, commands, and limits in the report.
Task status describes assignment completion, not passing checks.
