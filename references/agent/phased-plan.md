# Phased plan

Use this reference in `planner` with [its planning procedure](../../agents/planner.md).
Add the analysis below when the user requests phases or safe deployment requires them.
Typical reasons include serving traffic during a schema change, data backfills, or a consumer deprecation window.
Otherwise, recommend the immediate-change plan. Do not pad a plan with unnecessary phases.

## Phase analysis

Use as few independently mergeable phases as the change requires.
Each phase must leave the system working, including its error handling, validation, and relevant edge cases.
Do not postpone basic correctness to a later polish phase.

For each phase, state:

- Goal, acceptance examples, files, step order, and dependencies.
- Compatibility requirements, schema changes, and data ownership.
- Backfill or dual-write behavior when needed, with consistency checks.
- Existing verification and operational signals that show readiness.
- Rollback procedure and the point after which reversal is unsafe.
- Conditions for removing old paths, flags, or compatibility code.
- Whether the system remains usable if only this phase lands.

Finish with cross-phase risks, coordination needs, and unresolved decisions.
Planning remains read-only. A phased plan does not authorize execution.
