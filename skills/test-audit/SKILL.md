---
name: test-audit
description: Audit existing test suites for useful coverage, duplication, misleading assertions, and unnecessary test support. Use for a scoped suite assessment or approved test cleanup, including unchanged tests.
---

# Audit an existing test suite

Read `@agent-references/testing-standards.md` and applicable repository instructions.
Apply only assigned assessment or implementation. This skill grants no edit, execution, or delegation authority.
Audits are read-only unless approved scope explicitly includes cleanup.

## Establish the scope

Resolve the requested suite, capability, package, or repository. Suite audits include unchanged tests.
Without scope, inventory suites and propose bounded batches. Do not silently sample convenient files
or claim completeness
from a sample.

Read test configuration, CI selection, setup, fixtures, relevant production entry points, and existing test commands.
Identify tests that run in each relevant environment. Record source state and inspected scope.
Use permitted existing commands for baseline evidence. A planner only proposes execution.
Do not add tools or run custom verification scripts to bypass a reviewer's tool restrictions.

## Assess coverage and candidates

Trace candidate assertions through claimed production behavior. Inspect callers, sibling paths, relevant dependency
contracts, overlapping tests, and available history before judging value. Separate evidence from missing history
or uncertain external consumers.

Classify each assessed candidate as retain, consolidate, rewrite, remove, or uncertain, with reasons.
Report important coverage gaps, incorrect test boundaries, and misleading pass conditions.
Optimize confidence and maintenance effort. Do not use a deletion quota or assume that passing tests are useful.

Before recommending a removal or loss of coverage, record:

- The exact test location, claimed contract, and failure its assertions can detect.
- The source of the expected behavior and relevant history, or the limits of available evidence.
- Existing assertions that will still detect that failure, or evidence that the contract is obsolete.
- Production and external consumers of any support code proposed for removal, including dynamic usage risks.
- The proposed change, coverage impact, risk, and focused validation command.

Preserve candidates with missing evidence as uncertain; report the bounded investigation needed.
Shared line execution alone does not make tests redundant.
Keep independently useful compatibility, security, release, storage, and other contracts under the shared standards.
A failing retained contract may reveal a product defect. Report it; do not delete the test to restore green.

## Propose or perform a coherent change

Return findings before edits. Group related changes around one behavior or owning component.
Before rewrites or consolidation remove old proof, identify required assertions and demonstrate replacement coverage.
Preserve uncertainty and risks for the user's reviewed cleanup decision.

Implement only when the role permits edits and reviewed approval covers target files and removals. Reuse same-scope
authorization. Preserve approval requirements for public interfaces and uncertain external consumers.
A test's sole local reference does not prove a production export is unused.
Remove unnecessary helpers or runtime hooks only after their lack of real consumers is established.
Avoid introducing replacement wrappers or tests that reproduce the same weak evidence.

Do not edit a checkout while its tests run. Run available affected tests before and after approved changes.
When replacing static assertions, check sibling coverage and actual executable behavior.
Use `verify` for results and limits. A passing reduced suite alone does not prove that removed coverage was redundant.
Report any unavailable validation without claiming that the cleanup is verified.

## Return the assessment

Report candidate decisions, evidence, coverage gaps, and uncertainty. For cleanup, include changes and verification.
Separate inspected scope from unassessed suites. Report valuable apparent false positives, preserved contracts,
test-support changes, executed checks, and necessary follow-up.
Keep plans and execution logs in conversation or an authorized task location. An audit does not authorize shipping.

## Assessment guidance

The following Reviewer Standards, Review Target, and Review Criteria apply only while assessing the requested suite.
Their read-only conduct does not apply to approved cleanup. Cleanup still requires the assigned role's edit permissions
and reviewed authorization.

{{include:review-guidance.md}}

The assessment-only guidance above does not grant edit authority or restrict separately approved cleanup.
