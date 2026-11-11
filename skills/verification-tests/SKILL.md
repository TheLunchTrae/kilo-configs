---
name: verification-tests
description: Design and generate reusable verification tests for existing repositories or established functionality. Use to backfill coverage, create characterization baselines, or make complex behavior repeatably testable.
---

# Verification tests for existing behavior

Apply only the assigned portion within scope, authorization, review requirements, and budget.
This skill does not expand roles, permissions, or read-only assignments.
Read `@agent-references/verification-scope.md` before discovery. Apply its limits separately to coverage design,
test generation, execution, and infrastructure changes throughout this procedure.
Before writing tests, read applicable project and language guidance and apply the implementation guidance below.
The following implementation guidance applies only when writing tests within approved scope:

{{include:implementation-standards.md}}

The preceding implementation guidance does not authorize edits during design-only or inspection assignments.
Read `@agent-references/testing-standards.md` for coverage design and authoring decisions.

Build executable coverage for established behavior. Use `test-first` when implementing a new behavior or fixing a bug.
A verification suite can combine unit, integration, contract, CLI, API, or end-to-end tests as the scope requires.
Full verification covers agreed behavior and boundaries, with explicit exclusions and gaps.

## Discover the scope and available evidence

1. Resolve capability, module, workflow, or repository scope. Inspect established behavior beyond the diff.
   Without scope, inspect the repository and propose coverage before generating tests.
2. Read repository instructions, manifests, declared and installed versions, CI, test configuration, existing tests,
   fixtures, and documented commands. Verify paths and tools before proposing them.
3. Trace relevant entry points, callers, dependencies, outputs, errors, state changes, and external side effects.
   Identify important boundaries and explain testing difficulties.
4. Identify reusable tests, helpers, and fixtures. Have a permitted executor run relevant available checks and record
   baselines. Read-only planners propose checks without executing them.
5. For repository-wide requests, map in-scope surfaces and prioritize risk. Report uncovered surfaces;
   do not silently limit scope to easily tested functions.

## Establish expectations and design the suite

Derive expectations from documented requirements, public contracts, approved examples, or independent reference data.
Inspect implementation for execution paths. When observation is the only evidence, label tests as characterization;
observation does not establish correctness.
Report suspected bugs and consequential ambiguities as unresolved items. Continue independent, unambiguous coverage
where possible. Do not approve suspected defects as requirements or fix application code.

Create a compact coverage map. For each behavior, include:

- Expected observable result and source; distinguish requirements from characterization assumptions.
- Relevant normal, boundary, invalid-input, failure, recovery, and side-effect cases, each with a reason.
- Reusable coverage and the gap each proposed test addresses.
- Appropriate test level, real entry point, substituted dependencies, and their limits.
- Fixtures, environment prerequisites, setup, cleanup, isolation, and execution command with working directory.
- Dependencies, risks, and behavior that will remain unverified.

Choose the smallest level exercising the contract. Use integration or end-to-end coverage when unit
tests are insufficient.
Use `end-to-end-tests` for complete journeys; include its boundaries and fixtures in this map.
Load relevant stack skills for provider and runtime guidance.
For missing in-scope harnesses, propose the smallest suitable setup using the project's language and available tools.
For excluded infrastructure, report the accepted limit and reuse permitted coverage without proposing a harness.
Explicitly list new dependencies, testability refactors, CI changes, and external environment needs in the design.
Use `project-standards` only for deliberate tooling or convention adoption; routine tests do not require it.

Before generating tests, confirm that authorization covers files, commands, and exclusions.
Reuse the existing plan and seek design review when consequential coverage or infrastructure risks warrant it.
Design-only assignments return the design and unresolved decisions.

## Generate maintainable tests

- Extend existing suites and conventions. Reuse sufficient tests without duplication.
  Keep tests, fixtures, helpers, and test docs in the target repository.
- Exercise application behavior or the actual declarative contract. Avoid assertions that merely echo the input,
  repeat the implementation algorithm, inspect incidental source text, or verify a mock's configured answer.
- Assert relevant outputs, errors, persisted state, and observable side effects. Prefer public interfaces over private
  helpers unless the project has an established reason to test those helpers directly.
- Keep the subject and tested behavior real. Substitute dependencies only at justified boundaries;
  state integration claims the substitutes cannot establish.
- Control time, randomness, fixture state, and external services affecting repeatability. Isolate mutable test data.
  Bound waits and clean up after success or failure. Follow project parallel-execution rules.
- Use disposable test resources and synthetic data. Do not depend on production data, personal credentials, or a
  developer's machine state. Expose required configuration through the project's existing test conventions.
- Use clear behavior-based names and focused assertions. Add shared helpers only for genuine repeated setup.
  Keep expected values independently derived and review meaningful snapshots before accepting them.
- Preserve production behavior. Implement testability refactors, dependency installations, or CI changes only when
  included in the approved scope. Report missing access or an unavailable environment as unresolved items.

## Execute and assess the baseline

Run generated tests against recorded source. Baselines can pass immediately; do not require artificial red/green cycles.
Assess regression detection. Where practical, demonstrate it with a known counterexample or controlled fault in an
isolated disposable copy. Do not force failures in the working application or add checklist mutation tooling.

Use [verify](../verify/SKILL.md) for execution evidence and statuses. Record actual commands, working directory, source
state, collected tests, results, and environment limits. Check relevant suites and integration boundaries.
Report zero expected tests, skipped checks, missing services, and harness failures by actual status;
none proves passing behavior.

Distinguish test/fixture defects, preexisting application defects, and unavailable infrastructure.
Report correct tests exposing existing defects as failures. Do not weaken assertions, blindly accept snapshots, or alter
requirements for a green baseline. Return the suite, coverage map, observed evidence, and outstanding review needs.
Resolve assigned findings within approved scope and budget.

## Hand off and reuse

Return the coverage map, changed tests, actual checks, and limits. Keep design-only, execution-only, and implementation
results distinct.

Update existing test documentation with prerequisites, setup, commands, cleanup, covered contracts, and known limits.
Keep it concise and colocated with project guidance. Keep plans and execution logs in conversation or the authorized
project task location. Do not add process reports to global configuration or commit them without authorization.

For later changes, map changed behavior and affected integrations to suite assertions. Reuse tests covering intended
contracts. Extend meaningful gaps only through approved implementation; `verify` remains evidence-only.
Update expectations only for a reviewed requirement change, never simply because the implementation changed.
Rerun affected checks on current source and environment. Passing baselines verify only behavior
exercised by their assertions.
Report uncovered changes and stale evidence; do not claim full verification.
