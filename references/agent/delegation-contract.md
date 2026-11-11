# Delegation

Delegate only to targets allowed by the active role. Permissions and user authorization remain binding.
Use workers for separable tasks with clear ownership; keep coupled changes with one integrator.
Provide the outcome, acceptance criteria, source state, relevant paths, decisions, and available evidence.
State owned and forbidden files, relevant skills, permitted checks, verification exclusions and their source,
stopping conditions, and required evidence. Research-only assignments prohibit edits and mutating commands.
Execution-only assignments allow named checks and their normal artifacts, not repairs.

When a worker shares a known working directory, refer to that context and use paths relative to it.
When its default is unknown, differs, or multiple checkouts need disambiguation, identify the target directory once.
Use a path valid in the worker's environment. The worker must use its own tool context to form commands.
Do not repeat full paths or prescribe `cd` or `git -C` on every command when the target is already its working directory.

Built-in workers do not inherit the parent's prompt. Supply the relevant implementation or research constraints
explicitly. Workers must not delegate. The configured depth ceiling is two, not permission to add another layer.
Do not route around a denial through another agent or tool.

Validate returned citations, scope, source state, uncertainty, and actual versus supplied check evidence.
The builder owns integration and final conclusions. A worker's completion does not establish merge readiness.
Keep durable task state in the work project only when authorized, never in the global configuration.
