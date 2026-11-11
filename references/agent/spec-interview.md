# Specification interview

Use in the builder or planner when missing requirements would materially change the implementation.
Do not interview for a known bug, an explicit implementation plan, or facts available in the repository.
Do not ask again for information already supplied by the user.

1. Read the feature seed, relevant code, existing constraints, and prior decisions.
2. Identify unknowns about user behavior, interfaces, data ownership, failure cases, security, and acceptance.
3. Ask a small batch of consequential questions. Explain a tradeoff when it helps the user decide.
4. Incorporate the answers. Separate confirmed decisions, low-risk assumptions, and unresolved blockers.
5. Stop when the acceptance examples are executable and consequential ambiguity is resolved.
   Do not impose a question quota or invent answers to finish the interview.

Return a concise specification with these sections:

```text
Goal and non-goals
Users and observable behavior
Data shape, ownership, and lifecycle
Interfaces, errors, and edge cases
Acceptance examples
Confirmed decisions and assumptions
Open decisions and blockers
```

Show the specification in the conversation first. Save it only when authorized, in the project's existing docs location.
Do not overwrite an existing specification. Do not write application code during the interview.
A completed specification is input to the planner, not implementation approval.
For long work, prepare a `checkpoint` so a fresh session can validate and use the specification.
