---
name: push
description: "Push the current branch to the remote"
---

Push the current branch to its remote:

1. Run `git status`. Confirm a clean tree with no missing intended changes.
2. Run `git branch -vv` to check upstream tracking.
3. Push:
   - If a tracking branch exists: `git push`
   - If no tracking branch: `git push -u origin <branch-name>`
   The first push needs `-u origin <branch>` to establish upstream tracking.
4. Retry network failures up to 3 times with brief pauses. Do not retry auth, permission, or repo-not-found failures.
5. Stop and report non-fast-forward rejection. Never force-push without explicit authorization for this push.
6. Confirm success with the remote URL and branch.

Repository-level AGENTS.md instructions take precedence over these defaults.

$ARGUMENTS
