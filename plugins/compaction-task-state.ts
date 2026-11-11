import type { Plugin } from '@opencode-ai/plugin';

// Appended after OpenCode's default compaction prompt. It follows a subset of the checkpoint skill's handoff
// fields so automatic compaction keeps the state that authorization and verification rules depend on.
const TASK_STATE_GUIDANCE = `Preserve task control state in the summary. When the conversation established them, record:

- Task objective, active agent, and requested stopping point.
- Approved scope, non-goals, unresolved decisions, and actions that still require user permission.
  Discussion is not approval.
- Verification limits and their source: permitted checks, exclusions, and conditions for continuing without checks.
- Checks actually run: command, working directory, PASS, FAIL, BLOCKED, or SKIP, and the source state checked.
- Review findings and their disposition.
- Changed files, delegated work, file owners, and their status.
- Repair attempts used and remaining budget.
- Blockers and the next bounded action.

Keep exact paths, commands, identifiers, and error text. Mark unrecorded or uncertain items as unknown; do not
infer approvals or check results. Omit fields that do not apply.`;

// eslint-disable-next-line @typescript-eslint/require-await -- OpenCode's plugin factory requires a Promise result.
export const CompactionTaskStatePlugin: Plugin = async () => ({
  // eslint-disable-next-line @typescript-eslint/require-await -- The hook contract returns a Promise.
  'experimental.session.compacting': async (_input, output) => {
    output.context.push(TASK_STATE_GUIDANCE);
  },
});
