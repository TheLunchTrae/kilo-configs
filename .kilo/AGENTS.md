# Kilo Code configuration maintenance

## Scope

This repository supplies reusable global Kilo Code configuration. Root `AGENTS.md` ships to every session.
Keep repository-only maintenance rules here; `.kilo/kilo.jsonc` loads this file through `instructions`.
The target is Kilo Code only. Do not maintain an OpenCode host or add fallback support for its configuration.
Do not move maintenance rules into global config.
Keep `README.md` to a brief personal-configuration description, except for required license notices.
Do not add a usage guide or store task reports, private conversations, or research dumps here.
Read affected source before editing. Follow root authorization, tool-selection, security, and verification rules.

## Kilo runtime

The configuration targets [Kilo 7.8.27](https://github.com/Kilo-Org/kilocode/releases/tag/v7.8.27).
Use Kilo configuration and state paths. Preserve published API identifiers that the current plugins require.

### Configuration paths

- The default installation is `~/.config/kilo/`. Keep the full repository layout together.
  Kilo reads `kilo.jsonc`, `tui.jsonc`, `AGENTS.md`, agents, commands, skills, and local plugins from that directory.
  The nested `.kilo/` directory contains maintenance rules only.
- `references.agent-references.path` uses the default installation's absolute home-relative path.
  Kilo resolves ordinary relative reference paths against the work project, not this configuration directory.
  For custom XDG or configuration directories, set this reference to the actual absolute directory.
- Local guards read `KILO_COMMENT_GUARD` and `KILO_SCRUB_ENV_ALLOW`. They do not read the retired OpenCode variables.
- Do not migrate or delete existing sessions, credentials, bookmarks, or saved profile selections as part of setup.
- Preserve the Windows Git Bash path in `shell`. Other platforms must select an installed shell before use.

### Lunchbox plugin packages

Model Profiles, Prompt Composer, and Tool Inspector use their Kilo packages. Each reads only Kilo directories
and `KILO_*` variables.

- Model Profiles reads `models.jsonc` from `KILO_CONFIG_DIR`, else the Kilo XDG configuration directory.
  The default installation therefore needs no `configFile` option. Set it only for a models file in another place.
- Prompt Composer discovers `prompts/` in the same configuration directory and in project `.kilocode` and `.kilo`
  directories. It takes no plugin options.
- Kilo installs each npm plugin specifier once into its package cache and does not refresh it.
  A version range gets a newer release only after that cache entry is removed or the specifier changes.

### Native behavior and plugin limits

- The user works mainly through one top-level agent. `code` is the default primary agent.
  `agents/code.md` supplies its prompt and permissions. Kilo addresses `code` by name: it is the native default,
  the plan follow-up starts implementation in it, and `/review` fixes target it. Do not add a replacement primary.
- Native `plan` is the only other primary agent. The user selects it for large tasks. It writes
  `.kilo/plans/<timestamp>-<slug>.md` in a Git project, or a file under the Kilo data directory otherwise.
  Its follow-up hands the plan to `code` in a new or the same session.
  It delegates only to `explore`. `plan_enter` is a permission key in the pinned release, not a registered tool,
  so `code` cannot switch the user into plan mode.
- Keep the native `ask`, `debug`, and deprecated `orchestrator` modes disabled. `code` covers their work.
  `/review` can offer fixes in `debug` or `orchestrator`. Those options are unverified while the modes are disabled.
- Global `edit` is `ask`. Do not change it to a wildcard denial. Kilo appends a global denial after the native plan
  guard, which blocks plan files. Task children of a native agent also inherit denials, so `general` would lose its
  edit tools when `code` starts it. Kilo does not inherit `ask` rules into Task children.
- Give every agent an explicit `edit` rule: `allow` for writers and `deny` for read-only agents.
  An agent without one asks before each edit. Native `plan` keeps its own plan-file guard.
  Kilo applies global rules after the native `explore` deny-all, so `explore` needs its explicit `edit: deny`.
  The experimental Scout flag adds `scout` and reference agents built the same way. If it is enabled, deny their edits.
- `web_search: true` supplies the native `websearch` tool for direct providers. Without it, Kilo supplies the tool
  only for its gateway providers or when a search provider flag is set. The tool sends queries to a hosted search
  service and follows the default `allow` rule.
- Keep provider/model identifiers, profiles, variants, and permission order unchanged.
  Direct `openai/` and `anthropic/` identifiers do not become Kilo Gateway identifiers.
  Account access and model availability require a separate user-side check.
- Kilo forcibly denies tools for `summary`, `compaction`, and `title`.
  Their retained `edit: ask` settings express the source policy but do not override that native restriction.
  Kilo also enforces a read-only shell allowlist for `explore`.
- `modelRef`, `models.jsonc`, and `{{include:...}}` are plugin contracts, not native Kilo features.
  Confirm loaded agents and expanded prompts before relying on their effective models or shared instructions.
  A successful JSON parse does not prove that a plugin loaded or an include expanded.
- The four local server plugins use Kilo's published plugin API.
  Use the pinned `@kilocode/plugin` and `@kilocode/sdk` packages for local server and TUI integrations.
  Keep helper modules and auto-discovery placement intact.
- Config/context panels and bookmarks use shared TUI APIs, but source compatibility does not verify interactive
  rendering. Kilo and this workspace use different OpenTUI versions. Verify source activation on Kilo and report
  rendering checks separately. Npm-installed plugin behavior is outside this repository's test scope.
- Secret guards are heuristic defenses, not a sandbox. A plugin that fails to load provides no protection.

### Verification and upstream evidence

- Run native integration checks on the pinned Kilo release. Do not install OpenCode for regression coverage.
- Preserve the third-party test exclusion below. Do not load published Lunchbox plugins in repository fixtures.
- Configuration and discovery:
  [Kilo CLI](https://kilo.ai/docs/code-with-ai/platforms/cli),
  [plugins](https://kilo.ai/docs/automate/extending/plugins),
  [released reference resolution](https://github.com/Kilo-Org/kilocode/blob/v7.8.27/packages/opencode/src/kilocode/reference.ts),
  [released agent policy](https://github.com/Kilo-Org/kilocode/blob/v7.8.27/packages/opencode/src/kilocode/agent/index.ts).

## Configuration and prompts

- Native agent files own prompts, modes, colors, `modelRef`, and agent permissions.
  `kilo.jsonc` owns global defaults, built-in agent settings, plugin registrations, and native boundaries.
  `models.jsonc` owns model refs, profiles, and refs for built-in agents.
- Preserve provider/model choices unless explicitly requested. Inspect installed dependencies and current native
  behavior before changing runtime assumptions. Do not infer loading or permissions from JSON parsing alone.
- Preserve system edit approval, title/compaction `options.reasoningEffort`, the global Task denial,
  ordered shell rules, and secret Read guards. Agent permissions append to global rules; the last matching rule wins.
- Kilo's built-in shell default is `ask`, so keep the `"*": "allow"` fallback first. After it, the shell policy
  blocks a few whole commands and asks before `git commit`, `git push`, `git stash`, `git checkout`, and `sudo`. Do not
  add flag variants or pattern lists; root `AGENTS.md` Shell Safety lists the commands agents must not run. Agents run
  project scripts through the shell, so `shell.env` scrubbing covers them. Do not set rules that match a Kilo default.
- Keep permissions minimal. Add a rule only when it changes behavior; never restate a default or an inherited rule.
- Read-only agents inherit the global shell policy. Their prompts forbid commands that change files, Git state, or
  remote services.
  File reads and searches use the native `read`, `grep`, and `glob` tools.
- The native `code` agent is the primary integrator. Planner/reviewers are read-only leaves. Built-in general is an
  editing worker; explore retains native restrictions. Native `plan` delegates only to `explore`.
  Keep delegation exact and deny by default. No routes from reviewers to writers.
  Keep `subagent_depth` at one so a primary agent can start workers but workers cannot create another Task layer.
  `agent_manager` is a separate top-level session route, not a Task child. It asks globally and is denied for workers.
  Verify transitive reachability and both routes without granting tools to make a check pass.
- Skills are native `skills/<name>/SKILL.md` files with discoverable descriptions. Load stack guidance only for
  relevant work. Do not recreate language personas, automatic stage fan-out, or universal response envelopes.
- Use Prompt Composer for shared implementation/review fragments. Includes belong explicitly in agent/command bodies.
  Conditional references remain under the hidden `agent-references` reference in `references/agent/`.
  Verify moved-file consumers and includes during migrations; hidden visibility grants no permission.
- Skill includes expand only through the native `skill` tool, not raw reads or skill-derived slash commands.
  Keep required references and fragments with standalone skills. Skills cannot override role or authorization limits.
- Kilo loads global instructions for task sessions; children do not inherit parent role prompts.
  Built-ins without authored prompts must retain native fallback prompts.
- Keep utility commands in the selected role. `/test-audit` explicitly invokes a fresh reviewer subtask.
  Preserve `$ARGUMENTS`, the native `/resume` selector, and `/resume-work` handoff behavior.
- Register Model Profiles and Prompt Composer once each in both server/TUI lists, in that order.
  Register Tool Inspector once, in the TUI list only; it has no server entrypoint.
  Kilo installs npm plugins from these lists; do not add them to `package.json`.
  Use the same version range for the three packages in both lists. `models.jsonc` uses the Model Profiles schema
  for that minor version; update its URL with the range.
  Model Profiles' only plugin option is `configFile`; Prompt Composer uses `prompts/`.
  Keep runtime metadata out of provider request options. Model Profiles removes `modelRef` before Kilo builds
  agents; do not add other plugin-only agent keys. Do not add compatibility layers for removed roles.
- `/model-config` saves defaults only or a named profile per worktree, outside `models.jsonc`.
  `KILO_MODEL_PROFILE` overrides the saved choice; with neither, `defaultProfile` applies. A profile that
  `models.jsonc` does not define falls through to the next source. A profile overrides only the refs it names;
  `system` and `title` stay on defaults.
  A ref whose model no connected provider offers falls back to the model Kilo would use without the ref.
  Model Profiles rereads `models.jsonc` when Kilo loads a project. Restart the server after editing prompts or
  native files. Existing sessions may retain model selections.
- `/tools` is read-only. It omits MCP tools, and its agent access lists omit hidden agents such as `compaction`
  and `title`.
- `/view-prompts` is read-only, shows full loaded agents/commands, and does not expose full model context or skills.
  Inspect loaded text and diagnostics after restart; host hook errors can leave unresolved includes.
- Keep GitHub/Playwright MCP typed and disabled without credential interpolation. Do not inspect secrets for verification.

## Plugin tooling

Keep local plugin entrypoints in `plugins/` unless a documented loader or runtime constraint requires another location.
Keep shared helper modules outside auto-discovered plugin directories so their exports are not treated as plugins.
Document placement exceptions in source or these maintenance notes. Verify native discovery before moving or
registering entrypoints, and do not register an auto-discovered entrypoint again.

Run `npm ci` before editing plugins/extensions. Use workspace TypeScript and preserve compiler/OpenTUI JSX settings.
The DOM library supports Solid declarations; runtime ESLint globals remain limited to Node.js.
Keep npm, pinned dependencies, loader-required exports, and Promise-returning hooks. Explain narrow lint suppressions.

| Command | Purpose |
| --- | --- |
| `npm run check` | Type check, strict lint, formatting check, and unit tests. |
| `npm run format` | Format plugin/extension code, tests, and tooling configuration. |
| `npm run test:native` | Install pinned Kilo and check local integrations with isolated synthetic fixtures. |
| `npm run test:kilo` | Run the same Kilo native integration suite. |
| `npm run test:render` | Render the bookmark panel with Bun. |

Use Node 22.18 or newer. Rendered bookmark tests need Bun on PATH.
Kilo native installation supports x64 Linux/Windows. Source TUI activation needs Linux `script`; report other skips.
Set `npm_config_cache` to a writable task-local directory when necessary.

Test only what lives in this repository: `plugins/`, `extensions/`, their native loading, and `kilo.jsonc` policy.
Never test npm-installed or other third-party plugins here, including Model Profiles, Tool Inspector,
and Prompt Composer. Do not add unit or native tests that load, configure, or assert their behavior,
and do not install them as dependencies to make such tests possible. Their behavior belongs in their owning
repositories. Native fixtures load only local plugins and extensions.
Do not add unit or native snapshot assertions for personal config shapes, fixed agent names/counts, model inventories,
or exact permission maps. Use ad hoc reference and permission inspection during migrations.
Report native loading separately from model-assisted execution.
Do not send paid provider requests or use real credentials in test fixtures.

The native runner verifies the published pinned release and uses fresh temporary state. Registry/installation
failures stop the run; do not silently fall back to a cached binary. Report unavailable checks and preexisting failures.

## Plugin contracts

Read `plugins/block-secrets.ts`, `extensions/security/secret-paths.ts`, and their tests before modifying them.
Preserve path keys `filePath`, `file_path`, and `path`; `pattern` is a path only for glob. Match case-insensitively
and normalize backslashes. A complete `secrets` segment overrides template basenames. Reject calls even when the error
toast fails. Keep denial diagnostics accurate.
Bash token checks are heuristic; expansion, aliases, symlinks, and parent-directory searches limit protection.
Bash words split at whitespace and control operators, and the text after the first few and the last `:` or `=` is
also checked, so Git `rev:path` reads such as `git show HEAD:.env` are denied. Keep that bound; checking every suffix
of a long word takes quadratic time. Blob ids, globs, brace expansion, and archives still bypass the check.
`plugins/scrub-secrets.ts` blanks variables only for session shell calls; keep terminal panels unscrubbed.
It also drops hunk lines and binary patch data of denied paths from diff output. Keep hunk header counts and the
non-hunk-line check as the hunk end, so a cut or combined hunk cannot hide the next `diff ` header. A denied hunk
fails closed: lines after it drop until a new file, commit, or hunk header. Not redacted: `--graph`, indented,
line-numbered, or JSON-escaped patches, normal-format `diff` output, hunks without a file header, and header-less
patches after a hunk whose counts are too large.
Use synthetic credential-shaped values in its tests.
Do not describe the plugin as a sandbox.

`plugins/comment-guard.ts` blocks edit, write, and apply_patch calls whose added comment lines reference the
conversation, prompt, requests, or earlier iterations. It checks added line, block, trailing, and Python docstring
comments in code files, not strings, code, or prose files. Keep its phrase list narrow to avoid false positives.
`KILO_COMMENT_GUARD=all` blocks every new non-directive comment, `off` disables the guard, and any other value
blocks only leaks. Comment detection is heuristic, not a parser.

Session tools live in `extensions/session-tools/` with shared UI helpers outside auto-discovered plugin directories.
Their TUI-only entrypoints are registered in `tui.jsonc` and stay outside server plugin auto-discovery.
Keep config/context views read-only and preserve evidence limits. Bookmark storage stays scoped by project,
workspace, directory, and session; preserve malformed records on errors. Handoff drafts require explicit copy
and must never submit prompts automatically. Do not add workflow-stage tracking to these panels.

## Documentation and third-party material

Read `@agent-references/asd-ste100.md`; apply repository rules first. Use LF, readable Markdown, and 120-character
lines except indivisible URLs or literals. Preserve code, paths, identifiers, uncertainty, and requirement strength.
Use two spaces for YAML indentation. Keep skill bodies concise without weakening safeguards.
Before adapting third-party text, inspect the source and license. Required notices belong in `notices/` with covered
files identified in the README. Keep the root license separate and include notices with standalone distributions.
Do not add licenses merely for general ideas or independently authored guidance.
