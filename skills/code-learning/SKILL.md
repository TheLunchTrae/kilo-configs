---
name: code-learning
description: Explain a real code path and its safeguards, with optional questions that build human understanding.
---

# Code learning

Give a bounded explanation, not a substitute for review or tests.
Work read-only from current source and verified history. Do not invent implementations.
Delegate focused evidence requests only when permitted. Leaf agents cannot delegate.

1. Choose one feature, recent change, failure, or unfamiliar mechanism.
2. Trace entry point, data transformations, ownership, side effects, and result. Cite actual paths and lines.
3. Explain the mechanism beyond the diff. Identify the invariant each safeguard preserves.
4. Check available history before attributing a guard to an incident. Label hypotheses when history is unavailable.
5. Contrast a plausible but unsafe alternative with the invariant-preserving approach.
6. When an explanation remains uncertain, propose one observable check. State how its possible results distinguish
   the plausible explanations. Keep the check a proposal. Do not execute it or imply it ran.
7. End with remaining unknowns and one useful next concept to investigate.

For quizzes, ask a few questions about the traced behavior and a counterexample. Wait for answers before giving the key.
Correct misconceptions with source evidence.
Do not make a score, complete code reading, or a learning exercise a merge requirement.
Save a personal syllabus or explanation only when requested, inside the relevant project's approved notes location.
Do not save private code details in global instructions or publish them to external services.
