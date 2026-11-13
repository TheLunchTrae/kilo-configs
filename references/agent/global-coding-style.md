# Global Coding Style

These are cross-project defaults. Project, repository, language, and framework guidance takes precedence.

## Core principles

- Prefer the simplest solution that works and clear code over clever code.
- Extract repeated logic when the shared behavior is real. Do not generalize speculative future needs.
- Prefer deletion to unnecessary abstraction. Keep related behavior cohesive.

## State and ownership

Prefer immutable values when they make shared state and side effects easier to reason about.
Local mutation is appropriate when it is idiomatic, ownership is clear, or copying would obscure the code.
Do not label mutation a security defect by itself. Synchronize shared mutable state where required.

## Files and functions

Organize around the project's existing boundaries. Keep functions focused and modules cohesive.
Size is a signal to inspect responsibilities, not a universal line-count limit.
Split code when that improves comprehension, reuse, or testing; avoid fragmented one-purpose wrappers.

## Errors and validation

Handle errors at the boundary that can recover, translate, or add useful context. Otherwise propagate them.
Do not catch and log the same error at every layer or silently swallow failures.
Give users safe, actionable messages; keep sensitive internal details out of user-visible errors and logs.
Validate external data at trust boundaries with the project's existing validation tools.

## Names and control flow

Use descriptive names, as verbose as clarity needs, in the language's naming conventions.
Preserve established project terminology. Avoid acronyms unless their meaning is obvious to any reader of the code.
Use guard clauses when they simplify nested control flow. Name meaningful thresholds and repeated literal values.
Do not change naming, file size, or formatting merely to satisfy a generic default.

## Comments

Prefer clear names and structure to comments; improve names or refactor before adding an explanatory comment.
Use comments for non-obvious rationale, constraints, or workarounds that names and code cannot express.
Keep license notices, required directives, and existing comments that provide useful context.
Do not remove comments indiscriminately.
