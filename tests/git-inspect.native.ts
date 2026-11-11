import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nativeBinary } from './native-host.ts';

test('Kilo discovers local plugins and tools, blocks secret paths, and honors a per-agent deny', async (t) => {
  const binary = nativeBinary();
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(join(tmpdir(), 'kilo-git-inspect-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installation = join(root, 'config', 'kilo');
  const project = join(root, 'project');
  await mkdir(join(installation, 'agents'), { recursive: true });
  await mkdir(project);
  for (const path of ['plugins', 'extensions']) {
    await cp(join(repository, path), join(installation, path), { recursive: true });
  }
  await cp(await realpath(join(repository, 'node_modules')), join(installation, 'node_modules'), { recursive: true });
  for (const path of ['package.json', 'package-lock.json']) {
    await cp(join(repository, path), join(installation, path));
  }
  await writeFile(
    join(installation, 'kilo.json'),
    JSON.stringify({
      plugin: [],
      model: 'openai/native-fixture',
      enabled_providers: ['openai'],
      provider: {
        openai: {
          options: { apiKey: 'synthetic-test-key', baseURL: 'http://127.0.0.1:1/v1' },
          models: { 'native-fixture': { name: 'Native fixture', limit: { context: 4096, output: 1024 } } },
        },
      },
    }),
  );
  // Synthetic agents keep the test on the local plugin, not on personal role or permission configuration.
  await writeFile(
    join(installation, 'agents', 'inspection-reader.md'),
    '---\ndescription: Native inspection fixture\nmode: subagent\n---\nRead-only fixture.',
  );
  await writeFile(
    join(installation, 'agents', 'inspection-denied.md'),
    '---\ndescription: Native denial fixture\nmode: subagent\npermission:\n  git_inspect: deny\n---\nRead-only fixture.',
  );
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}),
    HOME: root,
    USERPROFILE: root,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_CACHE_HOME: join(root, 'cache'),
    KILO_TEST_HOME: root,
    KILO_DB: join(root, 'db.sqlite'),
    KILO_DISABLE_AUTOUPDATE: 'true',
    KILO_DISABLE_MODELS_FETCH: 'true',
    KILO_DISABLE_PROJECT_CONFIG: 'true',
    KILO_DISABLE_DEFAULT_PLUGINS: 'true',
    KILO_DISABLE_EXTERNAL_SKILLS: 'true',
    KILO_DISABLE_CLAUDE_CODE: 'true',
    KILO_EXPERIMENTAL_DISABLE_FILEWATCHER: 'true',
  };
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: project, env, encoding: 'utf8', timeout: 30_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '--quiet');
  await writeFile(join(project, 'app.txt'), 'public-native-fixture\n');
  await writeFile(join(project, '.env'), 'PRIVATE=synthetic-native-secret\n');
  await writeFile(join(project, 'package.json'), JSON.stringify({ scripts: { fixture: 'node --version' } }));
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture');
  const command = (args: string[]) => {
    const result = spawnSync(binary, args, { cwd: project, env, encoding: 'utf8', timeout: 60_000 });
    assert.ifError(result.error);
    assert.doesNotMatch(result.stderr, /failed to (?:load|install) plugin|plugin config hook failed/i);
    return result;
  };
  const help = command(['debug', 'agent', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout + help.stderr, /--tool/);
  assert.match(help.stdout + help.stderr, /--params/);
  const discovered = command(['--print-logs', '--log-level', 'DEBUG', 'debug', 'config']);
  assert.equal(discovered.status, 0, discovered.stderr);
  const config = JSON.parse(discovered.stdout) as { plugin: unknown[] };
  for (const file of [
    'block-secrets.ts',
    'comment-guard.ts',
    'compaction-task-state.ts',
    'git-inspect.ts',
    'project-script.ts',
    'scrub-secrets.ts',
  ]) {
    assert.ok(config.plugin.some((entry) => typeof entry === 'string' && entry.endsWith(`/plugins/${file}`)));
  }
  assert.ok(config.plugin.every((entry) => typeof entry === 'string' && entry.startsWith('file:')));
  const inspected = command(['debug', 'agent', 'inspection-reader']);
  assert.equal(inspected.status, 0, inspected.stderr);
  const agent = JSON.parse(inspected.stdout) as { tools: Record<string, boolean> };
  assert.equal(agent.tools.git_inspect, true);
  assert.equal(agent.tools.project_script, true);
  const scripts = command(['debug', 'agent', 'inspection-reader', '--tool', 'project_script', '--params', '{}']);
  assert.equal(scripts.status, 0, scripts.stderr);
  assert.match(scripts.stdout, /npm:fixture/);
  const run = (agent: string, params: Record<string, unknown>) =>
    command(['debug', 'agent', agent, '--tool', 'git_inspect', '--params', JSON.stringify(params)]);
  const read = run('inspection-reader', { operation: 'show', revision: 'HEAD:app.txt' });
  assert.equal(read.status, 0, read.stderr);
  assert.match(read.stdout, /public-native-fixture/);
  const secret = run('inspection-reader', { operation: 'show', revision: 'HEAD:.env' });
  assert.notEqual(secret.status, 0);
  assert.match(secret.stderr, /sensitive/);
  assert.doesNotMatch(secret.stdout + secret.stderr, /synthetic-native-secret/);
  const denied = run('inspection-denied', { operation: 'show', revision: 'HEAD:app.txt' });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /disabled for agent/);
  assert.doesNotMatch(denied.stdout, /public-native-fixture/);
});
