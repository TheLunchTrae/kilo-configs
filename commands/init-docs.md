---
description: Initialize or refresh repository documentation rules and scoped technical vocabulary.
subtask: false
---

Initialize the work repository's documentation settings:

$ARGUMENTS

Read `@agent-references/asd-ste100.md` for precedence, writing defaults, terminology, and formal-compliance requirements.
Honor the selected role, permissions, and approval policy. Do not switch agents or expand authority.
If the role cannot initialize, return the proposed setup within its scope.

## Resolve the destination

1. Establish the work repository's root and requested scope with available read-only tools.
   Do not initialize an installed global configuration directory or a repository that supplies global configuration.
   Resolve unclear repository boundaries before proposing writes.
2. With no destination argument, use `AGENTS.md` at the repository root.
   Add or update documentation rules in the existing file, or create it if missing.
3. Use a user-supplied file instead of the default, or `AGENTS.md` inside a supplied directory.
   Resolve relative paths from the repository root. Absolute paths must remain inside the same repository.
   Treat a non-existent path with a trailing slash as a directory. Clarify other ambiguous destinations before writing.
4. Treat remaining arguments as scope or preferences. Keep every resolved destination inside the work repository,
   including symlink targets. Do not interpret arguments as shell commands.

## Inspect current policy and vocabulary

Read the destination, applicable agent instructions, contribution guides, documentation policies, templates, glossaries,
and documentation-tool configuration. Preserve authoritative standards and link existing definitions
without competing copies.

Inspect manifests, representative source, public APIs, and documentation for the requested areas.
Use current evidence for languages, frameworks, naming, and domain terms. Do not infer stacks solely from filenames
or populate generic language dictionaries. Report conflicts and gaps. Preserve definitions,
exclusions, and local overrides.
Scope different meanings by language, package, path, or domain.

Before creating an `AGENTS.md`, check existing `CLAUDE.md` or other fallback instructions that it could mask.
Preserve their effect with an explicit read instruction when needed. Do not replace them with a partial policy.
For a nested destination, respect its actual instruction scope and applicable ancestor rules.

## Propose the rules

Add or update a bounded documentation section without changing unrelated instructions.
Include concise repository-specific rules, not just a global-reference link or full copy.
Apply shared STE defaults to unspecified choices.

Include:

- Applicable documentation scope and the current authoritative style guides or templates.
- Repository preferences and deliberate exceptions to the shared STE defaults.
- Core writing rules: consistent terms, clear actors, separate instructions, and explicit conditions.
  Preserve actions that must occur simultaneously.
- Sentence-length guidance and preservation of meaning, uncertainty, requirement strength, and exact literals.
- The local terminology entries or an explicit instruction to read an existing terminology source.
- Formal STE requirements and the specified issue only when the user or repository explicitly requires them.
- Existing documentation checks and actual commands when relevant.

Local terminology is a technical-word allowlist and usage glossary supplementing ordinary English, not ASD's official
approved-word dictionary. Propose a small set of terms used in scope, with these fields:

| Field | Required content |
| --- | --- |
| Term | Preferred spelling and case, including exact identifiers when needed. |
| Kind and meaning | Noun, verb, acronym, or identifier, with its repository-specific definition. |
| Scope | Applicable language, framework, package, path, or domain. |
| Usage | Required wording and known misleading alternatives, when supported by repository evidence. |
| Source | A verified repository path or authoritative definition that supports the entry. |

Keep entries in the selected file, or reference an existing terminology source and propose necessary edits there.
Inferred terms remain proposals until reviewed. Leave unsupported definitions unresolved.
Preserve established technical terms beyond plain-language vocabulary. Do not turn prose alternatives into code renames
or import ASD's full dictionary.

For custom destinations, verify how agents read them and report required read instructions. Do not
assume automatic loading.
Edit other instruction files only within the approved setup.

Before setup, present destination, proposed rules, terminology, supporting-file changes, and conflicts.
Reuse valid same-scope approval or obtain missing approval required by the task or repository.

## Apply and verify

After the setup is approved, create missing files and merge approved additions into existing ones.
Do not alter global configuration, install tools, or rewrite application documentation as part of initialization.
Do not stage, commit, push, or publish the generated files.

On later runs, retain definitions and overrides. Make only supported updates or approved additions.
Report when the existing setup needs no changes.

Verify terminology evidence, scope, literal preservation, and the intended instruction-loading path.
Check relative links, document structure, and applicable existing documentation checks.
Review the diff for lost instructions, unintended policy changes, and unrelated edits.
Report created or updated paths, the applied policy, check results, and unresolved terminology.
