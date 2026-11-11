---
name: end-to-end-tests
description: Design and implement reliable end-to-end tests for new features or existing user journeys across real application boundaries. Use for browser, CLI, API, or worker workflows whose integration risks need complete-path coverage.
---

# End-to-end coverage

Read `@agent-references/testing-standards.md` and applicable project and language guidance.
Honor assigned role, approved scope, and verification limits. Design-only work does not edit or execute.
Confirm that authorization covers any harness or dependency changes. Reuse the feature plan when it covers this work.
Seek design review when consequential integration risks warrant it.

## Design the evidence

1. Inspect the feature contract, existing suites, manifests, installed tools, configuration, CI, and run instructions.
   Reuse the existing runner and fixtures. Do not assume a browser application or select a framework without evidence.
2. Trace the user or system entry point through components producing the outcome.
   State the verified boundary: browser through API and persistence, CLI through saved state, or
   request through worker completion. An in-process handler test does not prove deployment or transport behavior.
3. Derive a few independent journeys from requirements. Identify each actor, initial state, action, observable outcome,
   credible failure, existing coverage, and risk requiring this execution level.
4. Cover the important success path and consequential failure or recovery paths. Consider authorization, invalid input,
   persistence, retries, duplicate delivery, and asynchronous completion only where the feature makes them relevant.
   Keep detailed permutations at lower levels when they add no new integration evidence.
5. Map each journey to real components, substituted external dependencies, fixtures, isolated resources, target files,
   setup and cleanup, execution command, and remaining gaps. State the source of expected outcomes.
6. Include required application startup, readiness, service versions, migrations, and CI discovery in the design.
   Report missing capabilities without silently adding dependencies or infrastructure scope.
   Honor exclusions, report their effects, and continue independently verifiable in-scope work.

For new behavior or bug fixes, combine this design with `test-first`.
For established behavior, use `verification-tests` for the broader baseline and label characterization assumptions.
Share one coverage map. Do not create competing plans or duplicate tests for the same claim.

## Exercise the application

- Invoke the supported real browser, launched command, network endpoint, or worker path required by the claim.
  Keep owned application components on that path real.
- Seed only prerequisite state. Let the application perform the action being tested. Do not write the expected final
  database row, inject the completion event, or stub the success response that the journey claims to verify.
- Assert the resulting behavior, not merely navigation, a process starting, a success status, or a mock invocation.
  Observe persisted state through a fresh read or process when persistence is part of the contract.
  For denied operations, check both the intended denial and relevant absence of side effects.
- Reach the relevant guards. Object-ownership tests need authenticated actors reaching the ownership check;
  expired tokens cannot prove ownership enforcement.
- Substitute uncontrolled third parties only at explicit external boundaries when needed. Report unverified provider
  interactions. Browser tests mocking the application's own API establish only partial frontend coverage,
  not the full application path.
- Use disposable synthetic accounts and data with per-test or per-worker isolation. Avoid order-dependent tests,
  shared mutable fixtures, production resources, personal credentials, and unintended external effects.
  After success or failure, stop owned processes and remove owned resources without deleting another test's state.
- For browser tests, prefer accessible roles, names, labels, or established stable test identifiers over DOM structure.
  Use runner waiting assertions or bounded polling of meaningful conditions, not fixed sleeps.
  Await asynchronous outcomes before asserting effects. Bound readiness and operation timeouts.
- Capture useful diagnostics with the existing runner, such as exit output, server logs, traces, or screenshots.
  Keep secrets and personal data out of artifacts. Reuse simple helpers for repeated setup without hiding assertions.

## Demonstrate and report

For new behavior or bugs, observe the intended failure before implementation when execution is available, then rerun
the same test after the change. Missing services, syntax errors, and unrelated guard failures are not regression proof.
Report unavailable harness execution and establish meaningful failure evidence as soon as it becomes available.
Do not reconstruct an unobserved failure. Existing-behavior baselines can pass on their first run.

Use `verify` for focused journeys and relevant adjacent tests. Confirm expected test collection and discovery by the
configured command or CI job. Check isolation or repeatability for concrete risks. Do not hide
failures with retry loops,
unconditional waits, or optional assertions. Record retry-only passes and unresolved reliability implications.

Return the coverage map, real and substituted boundaries, commands, source state, results, and remaining gaps.
Separate authored tests from executed proof. Unavailable integrations and approved exclusions do not count as passes.
Update the project's existing test instructions with necessary setup, execution, and cleanup details.
Do not apply repairs during verification.
