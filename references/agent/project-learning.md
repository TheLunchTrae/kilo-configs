# Project learning

Assess explicitly requested failure prevention, evidenced recurring mistakes, or repeated attempts stopped by a blocker.
Primary agents and specialists use available evidence within their task, role, stopping conditions,
and remaining budget.
Do not delay required immediate reporting to complete this assessment.
Apply `@agent-references/verification-scope.md`. An accepted verification limitation alone is not a recurring mistake
or a reason to propose verification infrastructure. Preserve separately evidenced failures and defects.

## Assess the cause and prevention

1. Describe the failure pattern and affected scope. Identify supporting evidence and its source state.
   Separate personally observed evidence from supplied results and assumptions.
2. Distinguish unclear requirements, missing or stale context, unavailable access, missing tools or coverage,
   and implementation or reasoning errors. State unknown causes explicitly.
   Do not assume every failure needs documentation or tooling changes.
3. When evidence supports durable prevention, propose at most one targeted improvement to the project.
   Prefer an existing test, lint rule, or interface contract over a long global prompt.
   Reuse existing project documentation and tools when they address the cause.
4. For a proposed change, identify a check that would verify the prevention.
   Distinguish proposed checks from observed results.
5. If no preventive change is justified, report the missing prerequisite or next bounded investigation instead.
   Reuse an earlier assessment when its evidence remains current. Update it when new evidence changes the conclusion.

## Report within the assigned scope

Return diagnosis, evidence, proposed prevention, and verification in the existing response format.
Report unassigned changes and unresolved decisions as follow-up. This procedure does not authorize edits,
delegation, additional retries, scope expansion, or shipping. Existing authorization remains valid for its stated scope.

Keep approved project lessons in the work project's existing documentation.
Do not save task-process files without authorization or put project lessons in global configuration.
Learning notes and quizzes are not merge gates.
