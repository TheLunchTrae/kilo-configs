import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nativeBinary } from './native-host.ts';

test('native auto-discovery exposes git_inspect, blocks secret paths, and honors a per-agent deny', async (t) => {
  const binary = nativeBinary();
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(join(tmpdir(), 'opencode-git-inspect-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installation = join(root, 'config', 'opencode');
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
    join(installation, 'opencode.json'),
    JSON.stringify({
      plugin: [],
      enabled_providers: ['openai'],
      provider: { openai: { options: { apiKey: 'synthetic-test-key', baseURL: 'http://127.0.0.1:1/v1' } } },
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
    HOME: root,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_CACHE_HOME: join(root, 'cache'),
    OPENCODE_TEST_HOME: root,
    OPENCODE_DB: join(root, 'db.sqlite'),
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_MODELS_FETCH: '1',
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
    OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: 'true',
  };
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: project, env, encoding: 'utf8', timeout: 30_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '--quiet');
  await writeFile(join(project, 'app.txt'), 'public-native-fixture\n');
  await writeFile(join(project, '.env'), 'PRIVATE=synthetic-native-secret\n');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture');
  const run = (agent: string, params: Record<string, unknown>) => {
    const result = spawnSync(
      binary,
      ['debug', 'agent', agent, '--tool', 'git_inspect', '--params', JSON.stringify(params)],
      { cwd: project, env, encoding: 'utf8', timeout: 30_000 },
    );
    assert.ifError(result.error);
    return result;
  };
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
