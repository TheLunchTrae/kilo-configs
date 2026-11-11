---
name: typescript
description: Use when implementing, planning, or reviewing TypeScript, JavaScript, React, or Node.js code with runtime validation, async ownership, or component boundaries.
---

# TypeScript and JavaScript guidance

Apply project conventions and the installed language, runtime, and framework versions.

## Context and checks

Inspect `package.json`, lockfiles, and `tsconfig.json` for dependencies, scripts, module format, runtime, and strictness.
Check framework configuration before using framework-specific APIs.

Use configured type, lint, and test checks. Examples include `tsc --noEmit`, ESLint, Vitest, Jest, Mocha, and `node:test`.
These examples do not imply that the tools are installed or that those exact commands suit the project.

## Types and contracts

- Prefer `unknown` with narrowing to an `any` escape hatch.
- Validate data at trust boundaries. Use the project's schema library when available.
  A cast such as `JSON.parse(raw) as Config` does not validate the data.
- Use discriminated unions where they make states or results explicit.
- Avoid non-null assertions that hide an unverified assumption.
- Use `const`, strict equality, type-only imports, and `satisfies` where supported and consistent with the project.
- Use the project's logger in production paths.

## Async behavior

- Give each promise an explicit owner: await it, return it, or handle its completion and rejection.
  `void` marks an intentional discard but does not handle a rejected promise.
- Run independent work concurrently when resource limits and ordering allow it.
  Use sequential awaits when operations depend on one another.
- Avoid `forEach(async ...)` when the caller needs completion or failure results.
- Preserve error context at a useful boundary. Do not swallow failures with an empty catch or log-only fallback.
- Check parsing and other fallible operations against their callers' failure contracts.

## React boundaries

When React is present, check hooks ordering, dependency arrays, stale closures, and stable keys for reorderable lists.
For frameworks with Server and Client Components, keep hooks and browser APIs within the correct boundary.
Do not move an entire tree to the client to hide a boundary error.
Use effects for external synchronization; compute derived values during render.
Memoize only for measured cost or required identity stability. Inspect parent components and installed state,
data, and framework libraries before choosing patterns. Use existing accessible queries and journey tests.

## Security-sensitive boundaries

Inspect credentials, cookies, cryptographic material, user-controlled HTML, SQL, shell arguments, and filesystem paths.
Pay particular attention to `eval`, `new Function`, dynamic loading, unsafe object merges, and prototype pollution.
Use context-appropriate validation and output encoding. Use text rendering when HTML is not required.
A typed value alone does not establish that untrusted input is safe.
