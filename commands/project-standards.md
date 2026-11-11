---
description: Initialize or refresh work-project standards from KrishRVH/standards.
subtask: false
---

Initialize or refresh standards for the current work project:

$ARGUMENTS

Load the `project-standards` skill and follow its complete discovery, adoption, approval, and validation procedure.
Treat arguments as project context, scope, and preferences, not shell commands or destination paths.

Establish the work-project root with read-only tools. For an empty repository or new project folder, use that folder
and the supplied stack choices. Resolve unclear project boundaries and consequential missing stack choices
before selecting upstream profiles.
Do not initialize an installed global OpenCode configuration directory or a repository that supplies
global configuration.

Honor the selected role, permissions, approval policy, and stopping point. Do not switch agents or expand authority.
If the role cannot apply the setup, return the proposed plan within its scope.
Apply changes only with the required plan approval and an editing role.
Preserve the skill's separate approval requirement for upstream executable configuration and scripts.
