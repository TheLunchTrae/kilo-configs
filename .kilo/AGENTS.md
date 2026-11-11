# Kilo Code configuration maintenance

## Scope

This repository supplies reusable global Kilo Code configuration. Root `AGENTS.md` ships to every session.
Keep repository-only maintenance rules here; `.kilo/kilo.jsonc` loads this file through `instructions`.
The target is Kilo's OpenCode-based runtime, not OpenCode V2. Do not move maintenance rules into global config.
Keep `README.md` to a brief personal-configuration description, except for required license notices.
Do not add a usage guide or store task reports, private conversations, or research dumps here.
Read affected source before editing. Follow root authorization, tool-selection, security, and verification rules.

## Kilo compatibility

These constraints apply before the inherited OpenCode plugin contracts below.
The configuration targets [Kilo 7.8.27](https://github.com/Kilo-Org/kilocode/releases/tag/v7.8.27).
Keep the OpenCode plugin implementations unchanged unless a separate port is authorized.

### Configuration paths

- The default installation is `~/.config/kilo/`. Keep the full repository layout together.
  Kilo reads `kilo.jsonc`, `tui.jsonc`, `AGENTS.md`, agents, commands, skills, and local plugins from that directory.
  Kilo does not discover `.opencode/` directories. The nested `.kilo/` directory contains maintenance rules only.
- `references.agent-references.path` uses the default installation's absolute home-relative path.
  Kilo resolves ordinary relative reference paths against the work project, not this configuration directory.
  For custom XDG or configuration directories, set this reference to the actual absolute directory.
- Model Profiles receives `configFile: "../kilo/models.jsonc"` in both plugin lists.
  Its unchanged loader resolves that value from its OpenCode configuration directory.
  This selects the sibling Kilo directory under the default or shared XDG configuration root.
  For another layout, set both plugin options to the actual absolute `models.jsonc` path. Do not use `~/` there.
- Prompt Composer still searches OpenCode paths. Scope `OPENCODE_CONFIG_DIR` to the absolute Kilo configuration
  directory in the process that launches Kilo. Do not set a persistent system-wide alias or link the two config trees.
  Without this override, the copied `{{include:...}}` fragments are not guaranteed to resolve.
  The override is a compatibility workaround, not a port. Unique snippets from existing OpenCode roots can still load.
- Model Profiles still uses OpenCode state, authentication, and cache paths for its own local discovery and saved
  profile selection. Kilo provider connections and old saved choices can therefore disagree with its fallback logic.
  Neither sessions, credentials, bookmarks, nor saved profile selections are migrated by this repository.
- Keep `OPENCODE_MODEL_PROFILE`, `OPENCODE_COMMENT_GUARD`, and `OPENCODE_SCRUB_ENV_ALLOW` unchanged.
  The reused implementations read those exact variable names.
- Preserve the Windows Git Bash path in `shell`. Other platforms must select an installed shell before use.

### Native behavior and plugin limits

- Kilo's native `code` agent replaces OpenCode's `build` name. Disable it with `plan`, `debug`, `ask`, and
  `orchestrator` so `builder` remains the configured primary workflow. Preserve the explicit leaf delegation rules.
- Keep provider/model identifiers, profiles, variants, and permission order unchanged.
  Direct `openai/` and `anthropic/` identifiers do not become Kilo Gateway identifiers.
  Account access and model availability require a separate user-side check.
- Kilo forcibly denies tools for `summary`, `compaction`, and `title`.
  Their retained `edit: ask` settings express the source policy but do not override that native restriction.
  Kilo also enforces a read-only shell allowlist for `explore`.
- `modelRef`, `models.jsonc`, and `{{include:...}}` are plugin contracts, not native Kilo features.
  Confirm loaded agents and expanded prompts before relying on their effective models or shared instructions.
  A successful JSON parse does not prove that a plugin loaded or an include expanded.
- The six local server plugins use hook and tool shapes present in Kilo's V1 API.
  Retain their OpenCode imports, helper modules, dependencies, and auto-discovery placement.
  Published Lunchbox packages have Node engine requirements, not an `engines.opencode` version gate.
- `/branches` is retained but unavailable on Kilo: its unchanged safety guard requires `http://opencode.internal`,
  while Kilo uses `http://kilo.internal` or a daemon transport. Do not weaken that guard to enable the panel.
  A host-aware branch-panel port requires separate authorization.
- Config/context panels and bookmarks use shared TUI APIs, but source compatibility does not verify interactive
  rendering. Kilo and this workspace use different OpenTUI versions. The original OpenCode native suite is not a
  Kilo certification, and npm-installed plugin behavior is outside this repository's test scope.
- Secret guards are heuristic defenses, not a sandbox. A plugin that fails to load provides no protection.
  `shell.env` scrubbing does not sanitize subprocesses launched directly by `project_script` or `git_inspect`.

### Verification and upstream evidence

- Keep the original OpenCode native checks as regression coverage for the unchanged plugin code.
  Report their host and version separately from Kilo runtime checks. `engines.opencode` describes that baseline.
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
- Preserve system edit approval, title/compaction `options.reasoningEffort`, global edit/Task denials,
  ordered shell rules, and secret Read guards. Agent permissions append to global rules; the last matching rule wins.
- Builder is the primary integrator. Planner/reviewers are read-only leaves. Built-in general is an editing worker;
  explore retains native restrictions. Keep delegation exact and deny by default. No routes from reviewers to writers.
  Keep `subagent_depth` at one so the builder can start workers but workers cannot create another Task layer.
  `agent_manager` is a separate top-level session route, not a Task child. It asks globally and is denied for workers.
  Verify transitive reachability and both routes without granting tools to make a check pass.
- Skills are native `skills/<name>/SKILL.md` files with discoverable descriptions. Load stack guidance only for
  relevant work. Do not recreate language personas, automatic stage fan-out, or universal response envelopes.
- Use Prompt Composer for shared implementation/review fragments. Includes belong explicitly in agent/command bodies.
  Conditional references remain under the hidden `agent-references` reference in `references/agent/`.
  Verify moved-file consumers and includes during migrations; hidden visibility grants no permission.
- Skill includes expand only through the native `skill` tool, not raw reads or skill-derived slash commands.
  Keep required references and fragments with standalone skills. Skills cannot override role or authorization limits.
- OpenCode loads global instructions for task sessions; children do not inherit parent role prompts.
  Built-ins without authored prompts must retain native fallback prompts.
- Keep utility commands in the selected role. `/test-audit` explicitly invokes a fresh reviewer subtask.
  Preserve `$ARGUMENTS`, the native `/resume` selector, and `/resume-work` handoff behavior.
- Register pinned Model Profiles and Prompt Composer packages once each in both server/TUI lists, in that order.
  Register pinned Tool Inspector once, in the TUI list only; it has no server entrypoint.
  OpenCode installs npm plugins from these lists; do not add them to `package.json`.
  `models.jsonc` uses the published schema of the pinned Model Profiles version; update its URL with the pin.
  Model Profiles' only plugin option is `configFile`; Prompt Composer uses `prompts/`.
  Keep runtime metadata out of provider request options. Model Profiles removes `modelRef` before OpenCode builds
  agents; do not add other plugin-only agent keys. Do not add compatibility layers for removed roles.
- `/model-config` saves defaults only or a named profile per worktree, in OpenCode state outside `models.jsonc`.
  `OPENCODE_MODEL_PROFILE` overrides the saved choice; with neither, `defaultProfile` applies. A profile that
  `models.jsonc` does not define falls through to the next source. A profile overrides only the refs it names;
  `system` and `title` stay on defaults.
  A ref whose model no connected provider offers falls back to the model OpenCode would use without the ref.
  Model Profiles rereads `models.jsonc` when OpenCode loads a project. Restart the server after editing prompts or
  native files. Existing sessions may retain model selections.
- `/tools` is read-only. It omits MCP tools, and its agent access lists omit hidden agents such as `compaction`
  and `title`.
- `/view-prompts` is read-only, shows full loaded agents/commands, and does not expose full model context or skills.
  Inspect loaded text and diagnostics after restart; host hook errors can leave unresolved includes.
- Keep GitHub/Playwright MCP typed and disabled without credential interpolation. Do not inspect secrets for verification.
  V2 ignores V1 plugins and top-level `subagent_depth`; a V2 port is separate work.

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
| `npm run test:native` | Install the newest supported OpenCode V1 runtime and check the original integrations. |
| `npm run test:native:minimum` | Run those checks on the oldest supported OpenCode runtime. |
| `npm run test:kilo` | Install pinned Kilo and check local server plugins with isolated synthetic fixtures. |
| `npm run test:render` | Render the bookmark panel with Bun. |

Use Node 22.18 or newer. Rendered bookmark tests need Bun on PATH.
OpenCode native installation supports x64 Linux/Windows. Source TUI activation needs Linux `script`; report other skips.
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

The native runner selects from the published supported range and uses fresh temporary state. Registry/installation
failures stop the run; do not silently fall back to a cached binary. Report unavailable checks and preexisting failures.

## Plugin contracts

Read `plugins/block-secrets.ts`, `extensions/security/secret-paths.ts`, and their tests before modifying them.
Secret path patterns are shared with `git_inspect`. Preserve path keys `filePath`, `file_path`, and `path`;
`pattern` is a path only for glob. Match case-insensitively and normalize backslashes. A complete `secrets` segment
overrides template basenames. Reject calls even when the error toast fails. Keep denial diagnostics accurate.
Bash token checks are heuristic; expansion, aliases, symlinks, and parent-directory searches limit protection.
`plugins/scrub-secrets.ts` blanks variables only for session shell calls; keep terminal panels unscrubbed.
Use synthetic credential-shaped values in its tests.
Do not describe the plugin as a sandbox.

`plugins/comment-guard.ts` blocks edit, write, and apply_patch calls whose added comment lines reference the
conversation, prompt, requests, or earlier iterations. It checks added line, block, trailing, and Python docstring
comments in code files, not strings, code, or prose files. Keep its phrase list narrow to avoid false positives.
`OPENCODE_COMMENT_GUARD=all` blocks every new non-directive comment, `off` disables the guard, and any other value
blocks only leaks. Comment detection is heuristic, not a parser.

Session tools live in `extensions/session-tools/` with shared UI helpers outside auto-discovered plugin directories.
Their TUI-only entrypoints are registered in `tui.jsonc` and stay outside server plugin auto-discovery.
Keep config/context views read-only and preserve evidence limits. Bookmark storage stays scoped by project,
workspace, directory, and session; preserve malformed records on errors. Handoff drafts require explicit copy
and must never submit prompts automatically. Do not add workflow-stage tracking to these panels.

`/branches` is a TUI-only extension in `extensions/branches/`. It requires the embedded local V1 server and a
worktree-root launch. Attached servers and workspace routing are blocked. Git operations require explicit confirmation.
Never add automatic stash, discard, force deletion, reset, rebase, push, or remote deletion to this panel.
Activity checks cover the current directory instance, not other instances or processes. They are warnings, not locks.
Keep confirmation cancellation, stale-state checks, worktree checks, and ignored-file protection on every mutation path.
Pull fetches first, then merges the upstream with fast-forward-only and ignored-file protection.
An interrupted command can leave Git changes or conflicts. Refresh and inspect before retrying. Never auto-abort.

## Documentation and third-party material

Read `@agent-references/asd-ste100.md`; apply repository rules first. Use LF, readable Markdown, and 120-character
lines except indivisible URLs or literals. Preserve code, paths, identifiers, uncertainty, and requirement strength.
Use two spaces for YAML indentation. Keep skill bodies concise without weakening safeguards.
Before adapting third-party text, inspect the source and license. Required notices belong in `notices/` with covered
files identified in the README. Keep the root license separate and include notices with standalone distributions.
Do not add licenses merely for general ideas or independently authored guidance.
