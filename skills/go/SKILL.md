---
name: go
description: Use when implementing, planning, or reviewing Go code, especially goroutine lifetime, cancellation, channels, and resource ownership.
---

# Go guidance

Apply project conventions and the installed Go version.

## Context and checks

Inspect `go.mod`, `go.sum`, and any workspace configuration before assuming a feature or package is available.
Follow existing package layout, receiver conventions, logging, and error handling.

Use the configured build, format, test, race, and analysis checks for the affected packages.
Examples include `go build ./...`, `go vet ./...`, `go test -race ./...`, `gofmt -l .`, and configured linters.
Run `staticcheck`, `golangci-lint`, or `govulncheck` only when available and appropriate.

## Errors and context

- Check returned errors. Use wrapping context when it adds information for the caller.
  Use `%w` when callers need to inspect the underlying error with `errors.Is` or `errors.As`.
- Reserve panic for exceptional programmer errors, not normal recoverable failures.
- Pass `context.Context` explicitly, normally as the first argument, for operations that support cancellation.
  Propagate it to downstream work. Do not add an unused context parameter to imply cancellation support.
- Prefer early returns to nested error ladders.
- Defer cleanup after successful resource acquisition. Check cleanup errors when they affect the operation's result.

## Concurrency and resources

- Give every goroutine a bounded lifetime and a shutdown path.
- Bound concurrent work with the project's existing mechanism.
  Use `errgroup` only if the dependency is available, or suitable standard-library primitives.
- Define channel ownership and closure rules. Handle closed receives where needed.
- Protect shared mutable state. Check lock release on every path and avoid channel or lock deadlocks.
- Choose cancellation and timeout mechanisms for the operation.
  Verify timer behavior against the installed Go version before asserting a leak.
- Do not introduce package-level mutable state without a clear lifetime and synchronization model.

## Interfaces and idioms

Prefer concrete results when the type is known. Keep interfaces small and define them near their consumers.
Use useful zero values where practical. Avoid unnecessary `init` side effects and speculative interfaces.

## Security-sensitive boundaries

Inspect credentials, crypto, SQL, process arguments, filesystem paths, and untrusted decoding.
Use parameterized queries and safe process argument APIs, while also checking option injection.
Path validation must respect directory boundaries and relevant symlink behavior; a string prefix alone is insufficient.
Check TLS configuration, unsafe operations, and data races in the affected path.
