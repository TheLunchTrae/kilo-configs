---
name: csharp
description: Use when implementing, planning, or reviewing C# and .NET code with nullable contracts, disposal, cancellation, or query boundaries.
---

# C# and .NET guidance

Apply project conventions and the installed language, framework, and package versions.

## Context and checks

Inspect `*.csproj`, `Directory.Build.props`, `global.json`, and relevant package configuration.
Confirm target framework, language version, nullable settings, application model, and installed packages.

Use configured build, analyzer, format, and test checks.
Examples include `dotnet build`, `dotnet test`, and `dotnet format --verify-no-changes`.
Use `--warnaserror` only when the project requires it. Follow the existing xUnit, NUnit, or MSTest setup.

## Async and cancellation

- Prefer async end to end. Examine blocking waits such as `.Result`, `.Wait()`, and `.GetAwaiter().GetResult()`
  for deadlocks, thread starvation, and broken request lifetimes.
- Reserve `async void` for required event-handler contracts.
- Propagate `CancellationToken` through cancellable or long-running work, normally as the last parameter.
- Follow the library or application's synchronization-context policy for `ConfigureAwait`.
  Do not impose a library convention on unrelated application code.

## Nullability and contracts

- Use honest nullable annotations and validate public or untrusted inputs.
  Use guard APIs supported by the project's target framework.
- Do not hide a possible null with `!` without a verified invariant.
- Prefer pattern matching or checked conversion when runtime types are uncertain.
- Address nullable warnings in the affected code without suppressing an underlying bug.

## Resources and idioms

- Use `using` or `await using` for owned disposable resources.
- Catch exceptions where the code can recover or add useful context. Avoid empty or overly broad catches.
- Check mutable static state for thread safety.
- Use records, pattern matching, file-scoped namespaces, and primary constructors when adopted by the project.
- Choose `IEnumerable` versus `IQueryable` deliberately. Check repeated enumeration and accidental client-side work.
- For EF Core, check tracking, query shape, resource lifetime, and repeated database access.
  Read-only queries usually do not need tracking; preserve any required identity behavior.

## Security-sensitive boundaries

Inspect credentials, crypto, SQL, process arguments, filesystem paths, and deserialization.
Use parameterized queries and established cryptographic APIs.
Avoid unsafe deserialization, including `BinaryFormatter` and unsafe JSON.NET `TypeNameHandling`.
Check CSRF protection where the authentication mechanism requires it.
Path validation must respect directory boundaries and relevant symlink behavior; a string prefix alone is insufficient.
