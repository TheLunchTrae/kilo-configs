---
name: commit
description: Use when preparing commit messages or staging and committing authorized changes.
---

For a message-only request, inspect the relevant diff and conventions, then return the proposed message without staging
or committing. For an authorized commit, stage and commit the specified changes:

1. Run `git status` to inspect staged and unstaged changes. Abort and report unresolved merge conflicts.
2. Stage only files or scope specified by `$ARGUMENTS`; otherwise stage all relevant changes.
   Include untracked files only when named.
3. Review `git diff --cached` for secrets: API keys, tokens, passwords, connection strings, and private keys.
   Stop and notify the user of anything suspicious. Unstage real secrets, repeat the scan,
   and do not commit until it is clean.
4. Inspect local contribution rules and recent relevant commit messages. Follow the repository's actual conventions;
   do not impose Conventional Commits or issue prefixes without evidence. Keep each commit focused on a coherent change.
   Write a concise message explaining the intent and why.
   Pass it through a permitted Git argument or dedicated tool field, preserving literal text and line breaks.
   Follow the tool-selection policy; do not use a HEREDOC.
5. Commit, then confirm success with `git status`.
   If a pre-commit hook fails, inspect its result and working-tree effects.
   Repair only within the authorized implementation scope and remaining budget. Otherwise report the unmet prerequisite.
   Preserve unrelated staged and unstaged changes. Do not stage hook output outside the specified scope.
   After an authorized repair, repeat affected checks and staged-diff review before creating a new commit.
   Never skip the hook (`--no-verify`, `-n`, `core.hooksPath`, `HUSKY=0`, `SKIP=`), edit hook files, or amend
   the previous commit to recover.

Repository-level AGENTS.md instructions take precedence over these defaults.

$ARGUMENTS
