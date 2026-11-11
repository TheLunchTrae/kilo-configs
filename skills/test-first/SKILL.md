---
name: test-first
description: Observe a meaningful failing test, implement a bounded behavior change, and verify the result.
---

# Test-first change

Use this skill for a behavior fix or feature with an available test seam.
Follow the assigned scope, authorization, task budget, and role boundaries.
Read `@agent-references/verification-scope.md` before applying the steps below. Honor separate limits on test generation
and execution. Report excluded red/green checks as `SKIP`; continue the approved implementation without claiming
an observed red/green cycle. An execution-only exclusion still permits assigned test generation.
Read `@agent-references/testing-standards.md` before selecting or writing a test.
Use `end-to-end-tests` for approved journeys needing the real application path. Reuse coverage design and failure
evidence; do not add a second test solely to satisfy both procedures.

1. Inspect the relevant code and configured test command. Record existing failures before changing behavior.
2. Define the acceptance examples independently of the proposed implementation.
3. Add the smallest meaningful regression or acceptance test. Run it against the unchanged implementation.
4. Observe the intended behavioral failure. Record the command, working directory, result, and diagnostic.
   A syntax error, missing dependency, timeout, or zero collected tests is not a valid red result.
5. Implement the smallest coherent change in the assigned scope.
6. Run the same test and observe green. Then run adjacent regression checks.
7. Simplify only within scope. Re-run affected checks after simplification.
8. Return the diff, red/green evidence, regression results, and unresolved limitations for independent review.

Keep the acceptance oracle independent. Do not skip, weaken, or rewrite an assertion merely to make the patch pass.
When a requirement genuinely changes, surface the proposed oracle change for approval and re-review.
Do not fabricate logs, reconstruct a failure that was never observed, or use a failed infrastructure check as proof.

Before pure refactors, preserve existing outputs with characterization tests. Green-to-green is appropriate.
For a documentation-only change, use relevant structural checks rather than inventing a unit test.
Without an accepted exclusion, report unavailable required execution as `BLOCKED` with the missing
dependency or environment.
Describe unrun checks as plans. Distinguish task completion from passing checks.
Do not install new tooling, access production data, or bypass permissions to produce a green result.
Respect the remaining task budget; return blockers when it is exhausted.

Report changed behavior, observed red/green evidence, regression results, and limits. Research-only assignments
return findings without edits. Execution-only assignments do not authorize repairs.
