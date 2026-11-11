# Completion

Compare the current diff with the authorized outcome and non-goals. Report unexpected changes and unresolved scope.
Run applicable configured checks within the agreed verification boundary, using `verify` when useful.
Report PASS, FAIL, BLOCKED, and SKIP accurately. Unrun checks and static parsing do not prove native behavior.
Accepted verification exclusions do not block other authorized work and never count as passes.

For non-trivial changes, obtain a fresh independent code review. Add security assessment only for high-risk boundaries.
Give reviewers the current target, acceptance criteria, relevant stack guidance, and verification evidence.
Resolve supported findings within authorized scope and refresh affected checks. Report unresolved findings and risks.
A review-only assignment ends with findings, not fixes.

Report changed behavior, observed checks, review dispositions, blockers, and remaining limits.
Assess merge readiness separately against applicable CI, review requirements, target currency, and conflicts.
Completion and review never authorize commits, pushes, PRs, merges, or deployment.
Use `checkpoint` for an authorized durable handoff. Read `@agent-references/project-learning.md` only when recurring
mistakes have concrete evidence; preventive changes outside the task require approval.
