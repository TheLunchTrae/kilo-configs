import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';
import { nativeBinary } from './native-host.ts';

test('Kilo native modes keep their edit boundaries under the configured policy', async (t) => {
  const binary = nativeBinary();
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(join(tmpdir(), 'kilo-native-modes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installation = join(root, 'config', 'kilo');
  const project = join(root, 'project');
  await mkdir(installation, { recursive: true });
  await mkdir(project);
  await cp(join(repository, 'agents'), join(installation, 'agents'), { recursive: true });
  const config = parse(await readFile(join(repository, 'kilo.jsonc'), 'utf8')) as {
    permission: Record<string, unknown>;
    agent: Record<string, unknown>;
  };
  await writeFile(
    join(installation, 'kilo.json'),
    JSON.stringify({
      // Edit tools do not start a shell. The inert shell prevents accidental command execution.
      shell: '/bin/false',
      plugin: [],
      permission: config.permission,
      agent: config.agent,
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
  // Plan-file patterns are relative to the worktree, so the project must be a repository.
  const init = spawnSync('git', ['init', '--quiet'], { cwd: project, env, encoding: 'utf8', timeout: 30_000 });
  assert.ifError(init.error);
  assert.equal(init.status, 0, init.stderr);
  const write = (agent: string, file: string) =>
    spawnSync(
      binary,
      [
        'debug',
        'agent',
        agent,
        '--tool',
        'write',
        '--params',
        JSON.stringify({ filePath: join(project, file), content: 'synthetic-native-fixture\n' }),
      ],
      { cwd: project, env, encoding: 'utf8', timeout: 60_000 },
    );
  const written = async (file: string) => {
    try {
      return (await readFile(join(project, file), 'utf8')) === 'synthetic-native-fixture\n';
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  };

  await t.test('plan mode saves a plan file', async () => {
    const result = write('plan', join('.kilo', 'plans', 'fixture.md'));
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(await written(join('.kilo', 'plans', 'fixture.md')));
  });
  await t.test('plan mode cannot edit source', async () => {
    const result = write('plan', 'plan-source.txt');
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, 'plan mode edited a source file');
    assert.equal(await written('plan-source.txt'), false);
  });
  await t.test('ask mode cannot edit source', async () => {
    const result = write('ask', 'ask-source.txt');
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, 'ask mode edited a source file');
    assert.equal(await written('ask-source.txt'), false);
  });
  await t.test('explore cannot save a plan file', async () => {
    const result = write('explore', join('.kilo', 'plans', 'explore.md'));
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, 'explore saved a plan file');
    assert.equal(await written(join('.kilo', 'plans', 'explore.md')), false);
  });
  await t.test('code mode edits source', async () => {
    const result = write('code', 'code-source.txt');
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(await written('code-source.txt'));
  });
});
