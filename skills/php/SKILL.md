---
name: php
description: Use when implementing, planning, or reviewing PHP, Laminas, or Mezzio code with version-sensitive APIs, validation, SQL, escaping, or middleware boundaries.
---

# PHP guidance

Apply project conventions and the installed PHP, framework, and package versions.

## Context and checks

Inspect `composer.json`, `composer.lock`, and framework configuration before assuming a helper or package is present.
Follow the project's PSR conventions, autoloading, dependency injection, and error handling.

Use configured Composer scripts and tools such as PHPUnit, Pest, PHPStan, Psalm, or PHP CS Fixer.
Framework commands such as `php artisan test` or `bin/phpunit` apply only when the project provides them.
Use static analysis and formatting in check mode during review.

## Types and contracts

- Use `declare(strict_types=1)`, typed properties, parameters, and returns in new code where project conventions allow.
- Represent nullability honestly. Use strict comparison for type-sensitive conditions.
- Use constructor promotion, `readonly`, enums, and `match` only when supported by the target PHP version.
- Prefer explicit state and properties to unnecessary magic methods or dynamic fields.

## Errors and dependencies

- Do not hide failures with `@` suppression, empty catches, or broad fallbacks.
  Use the project's exception conventions and preserve useful failure context.
- Avoid `die` or `exit` in reusable library code.
- Inject service dependencies instead of constructing them inside business logic.
  Avoid global mutable state.
- Use Composer autoloading and the project's bootstrap conventions.
  Do not introduce dynamic includes for service discovery.
- Keep debug output such as `var_dump`, `print_r`, and `dd` out of production paths.

## Boundary handling

- Use prepared statements or parameterized ORM queries for untrusted SQL values.
- Use framework-native escaping for HTML, with encoding appropriate to each output context.
- Prefer process APIs that separate executable and arguments.
  If a shell is required, validate arguments and quote them correctly; escaping alone does not prevent option injection.
- Do not expand untrusted keys into local variables with `extract` or related convenience patterns.
- Check upload validation, filesystem boundaries, session handling, and CSRF protection.
  Path prefix comparisons alone do not establish containment.

## Security-sensitive boundaries

For Laminas or Mezzio, inspect the installed components, module/config providers, routes, factories, and middleware
pipeline. Preserve PSR-7/PSR-15 boundaries and project container/factory conventions. Validate with the existing
InputFilter or form layer, and keep authentication, session, and CSRF handling in established framework facilities.

Inspect credentials, cryptographic operations, request-controlled paths, dynamic inclusion, and raw output.
Use established password and cryptographic APIs rather than custom schemes.
Avoid `unserialize` on untrusted input and verify serialization settings at trust boundaries.
Check deprecated APIs against the target PHP version rather than assuming a particular major version.
