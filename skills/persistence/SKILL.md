---
name: persistence
description: Use when planning, implementing, or reviewing EF Core or Doctrine queries, mappings, migrations, or persistence lifecycles.
---

# Persistence boundaries

Load `csharp` for EF Core or `php` for Doctrine. Inspect the installed ORM, database provider, schema,
entities, and migration conventions. Provider and major-version differences matter.

- Preserve identity, tracking, transaction, cascade, and unit-of-work contracts. Use explicit DTO mapping at
  untrusted boundaries. Do not return tracked entities across API boundaries.
- Inspect actual query shape, projection, repeated access, pagination, and N+1 behavior. Read-only queries often
  need no tracking. Consider split queries only with their consistency and round-trip costs.
- Propagate cancellation in EF Core async calls. Use bulk update/delete APIs only when the installed version
  supports them and bypassing tracked state preserves the contract.
- In Doctrine, preserve association ownership and mapping format. Bind query parameters, avoid blanket eager
  loading, and batch flush/clear in long-running jobs with explicit transaction and detached-object semantics.
- Never edit an applied migration or hand-edit an EF model snapshot. Read generated SQL before applying it.
  Plan data backfills for narrowing types, renames, and new required fields. Evaluate locking and rollback limits.
  Applying destructive or production migrations needs specific user authorization.
- Test queries and migrations through the project's provider-aware setup with disposable data.
  EF InMemory and mocked entity managers do not establish production-database behavior.
- Pause for unresolved authorization or security design in raw SQL, tenant filters, mass assignment,
  connection construction, or sensitive-value conversion. Request independent security review for high-risk changes.

Report provider-specific gaps and actual checks; the skill does not authorize database operations or expand a role.
