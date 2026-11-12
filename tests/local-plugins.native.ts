import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nativeBinary } from './native-host.ts';

test('Kilo loads the local plugins and runs their tool hooks', async (t) => {
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
  const secret = join(project, '.env');
  await writeFile(secret, 'FIXTURE=synthetic\n');
  // The mock model asks for one read of the secret file, then ends the turn once a tool result arrives.
  const model = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      const { messages = [] } = JSON.parse(body === '' ? '{}' : body) as { messages?: { role: string }[] };
      const chunk = (delta: object, finish: string | null) =>
        `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      const call = { index: 0, id: 'call_fixture', type: 'function' };
      const first = !messages.some((message) => message.role === 'tool') && !JSON.stringify(messages).includes('title');
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(
        first
          ? chunk(
              {
                role: 'assistant',
                tool_calls: [{ ...call, function: { name: 'read', arguments: JSON.stringify({ filePath: secret }) } }],
              },
              null,
            ) + chunk({}, 'tool_calls')
          : chunk({ role: 'assistant', content: 'done' }, null) + chunk({}, 'stop'),
      );
      response.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => model.close(() => resolve())));
  const { port } = model.address() as AddressInfo;
  await writeFile(
    join(installation, 'kilo.json'),
    JSON.stringify({
      plugin: [],
      model: 'fixture/native',
      small_model: 'fixture/native',
      enabled_providers: ['fixture'],
      // Allow everything so a block can come only from the local plugin, not from Kilo's own rules.
      permission: { '*': 'allow' },
      provider: {
        fixture: {
          npm: '@ai-sdk/openai-compatible',
          name: 'Native fixture',
          options: { apiKey: 'synthetic-test-key', baseURL: `http://127.0.0.1:${port}/v1` },
          models: { native: { name: 'Native fixture', tool_call: true, limit: { context: 8192, output: 1024 } } },
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
  // Discovery does not prove that a plugin loaded, so a full run must show block-secrets rejecting the read.
  const run = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(binary, ['run', '--format', 'json', 'Read the fixture file.'], { cwd: project, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => child.kill(), 120_000);
    child.on('error', reject);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /blocked by block-secrets plugin: read attempted to access/);
  assert.doesNotMatch(run.stdout, /FIXTURE=synthetic/);
});
