import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nativeBinary } from './native-host.ts';

test('Kilo discovers the local plugins', async (t) => {
  const binary = nativeBinary();
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(join(tmpdir(), 'kilo-local-plugins-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installation = join(root, 'config', 'kilo');
  const project = join(root, 'project');
  await mkdir(installation, { recursive: true });
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
  const command = (args: string[]) => {
    const result = spawnSync(binary, args, { cwd: project, env, encoding: 'utf8', timeout: 60_000 });
    assert.ifError(result.error);
    assert.doesNotMatch(result.stderr, /failed to (?:load|install) plugin|plugin config hook failed/i);
    return result;
  };
  const discovered = command(['--print-logs', '--log-level', 'DEBUG', 'debug', 'config']);
  assert.equal(discovered.status, 0, discovered.stderr);
  const config = JSON.parse(discovered.stdout) as { plugin: unknown[] };
  for (const file of ['block-secrets.ts', 'comment-guard.ts', 'compaction-task-state.ts', 'scrub-secrets.ts']) {
    assert.ok(config.plugin.some((entry) => typeof entry === 'string' && entry.endsWith(`/plugins/${file}`)));
  }
  assert.ok(config.plugin.every((entry) => typeof entry === 'string' && entry.startsWith('file:')));
});
