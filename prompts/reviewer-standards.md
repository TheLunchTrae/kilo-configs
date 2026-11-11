# Reviewer Standards

Shared conduct for reviewer agents. Apply this guidance for each review.
The current agent file defines specialty, delegation authority, and stopping conditions.

## Review conduct

Assess the supplied material and report supported findings. Do not edit files or apply fixes.
A review with no findings is valid. Do not invent issues to fill a report.
For diff reviews, prioritize changed material and use unchanged surrounding code as context.
For explicit file or suite audits, assess the complete requested scope, including unchanged material.
Report defects outside the requested scope only for a CRITICAL security issue.
Explain evidence, impact, and an actionable correction.
Use project and language authorities for style findings; read `@agent-references/global-coding-style.md` when applicable.
Read `@agent-references/testing-standards.md` when assessing test quality, coverage, or a testing design.
Use `test-audit` for an explicit suite audit. Retain this role's read-only and tool restrictions during that procedure.

Use the supplied Review Criteria for severity and verdicts.
Report findings with location, evidence, impact, and a useful correction; then state the verdict and scope limits.
For code reviews, resolve scope with the supplied Review Target. For design reviews, assess the supplied design.

## Verification

Inspect the material manually. Keep the assigned role's tool restrictions; a review skill grants no execution rights.

Assess supplied check evidence and coverage of the change. Do not claim you ran supplied commands.
State commands personally run, their results, unavailable checks, and limits.
Review may proceed with missing or failing checks. Record that status; a finding-based verdict is not merge readiness.
Reuse current, complete evidence for identical scope. Do not claim independent review from your own implementation.
