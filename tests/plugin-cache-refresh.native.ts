import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { nativeBinary } from './native-host.ts';

const POLL_INTERVAL_MS = 100;
const TIMEOUT_MS = 60_000;

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

test('native Kilo removes outdated tag and range packages while it runs', { timeout: 90_000 }, async (t) => {
  const binary = nativeBinary();
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(join(tmpdir(), 'kilo-plugin-cache-native-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = join(root, 'config', 'kilo');
  const project = join(root, 'project');
  const packages = join(root, 'cache', 'kilo', 'packages');
  const outdated = join(packages, 'fixture-plugin@latest');
  const ranged = join(packages, 'ranged-plugin@^1.0.0');
  const current = join(packages, 'current-plugin@latest');
  await mkdir(join(config, 'plugins'), { recursive: true });
  await mkdir(project);
  await cp(join(repository, 'plugins', 'plugin-cache-refresh.ts'), join(config, 'plugins', 'plugin-cache-refresh.ts'));
  await cp(join(repository, 'extensions', 'plugin-cache'), join(config, 'extensions', 'plugin-cache'), {
    recursive: true,
  });
  // Real copies prevent the host installer from mutating the checkout's dependencies.
  await cp(await realpath(join(repository, 'node_modules')), join(config, 'node_modules'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) {
    await cp(join(repository, file), join(config, file));
  }
  await writeFile(join(config, 'kilo.json'), JSON.stringify({ plugin: [] }));
  for (const [directory, name] of [
    [outdated, 'fixture-plugin'],
    [ranged, 'ranged-plugin'],
    [current, 'current-plugin'],
  ] as const) {
    await mkdir(join(directory, 'node_modules', name), { recursive: true });
    await writeFile(join(directory, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  }

  const registryRequests: string[] = [];
  const registry = createServer((request, response) => {
    registryRequests.push(request.url ?? '');
    const packument = {
      '/fixture-plugin': { 'dist-tags': { latest: '2.0.0' } },
      '/current-plugin': { 'dist-tags': { latest: '1.0.0' } },
      '/ranged-plugin': { 'dist-tags': { latest: '2.0.0' }, versions: { '1.0.0': {}, '1.2.0': {}, '2.0.0': {} } },
    }[request.url ?? ''];
    response.setHeader('content-type', 'application/json');
    if (packument === undefined) {
      response.statusCode = 404;
      response.end('{}');
      return;
    }
    response.end(JSON.stringify(packument));
  });
  registry.listen(0, '127.0.0.1');
  await once(registry, 'listening');
  t.after(() => new Promise<void>((resolve) => registry.close(() => resolve())));
  const address = registry.address();
  assert.ok(address !== null && typeof address !== 'string');

  await writeFile(join(root, '.npmrc'), `registry=http://127.0.0.1:${String(address.port)}\n`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_CACHE_HOME: join(root, 'cache'),
    KILO_TEST_HOME: root,
    KILO_DB: join(root, 'db.sqlite'),
    KILO_DISABLE_PROJECT_CONFIG: 'true',
    KILO_DISABLE_DEFAULT_PLUGINS: 'true',
    KILO_DISABLE_MODELS_FETCH: 'true',
    KILO_NO_DAEMON: '1',
    HOME: root,
    USERPROFILE: root,
  };
  const server = spawn(
    binary,
    ['serve', '--hostname', '127.0.0.1', '--port', '0', '--print-logs', '--log-level', 'INFO'],
    { cwd: project, env },
  );
  t.after(() => {
    server.kill('SIGKILL');
  });
  let output = '';
  server.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
  server.stderr.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
  const deadline = Date.now() + TIMEOUT_MS;
  let url: string | undefined;
  while (url === undefined) {
    assert.ok(server.exitCode === null && Date.now() < deadline, `Server did not start: ${output}`);
    url = /listening on (http:\/\/\S+)/.exec(output)?.[1];
    if (url === undefined) {
      await delay(POLL_INTERVAL_MS);
    }
  }
  // Server plugins load when the first request for a directory starts its instance.
  const response = await fetch(`${url}/config?directory=${encodeURIComponent(project)}`);
  assert.equal(response.status, 200, await response.text());
  while ((await exists(outdated)) || (await exists(ranged))) {
    assert.ok(Date.now() < deadline, `Outdated packages were not removed: ${output}`);
    await delay(POLL_INTERVAL_MS);
  }
  assert.equal(server.exitCode, null, 'The server keeps running');
  assert.equal(await exists(current), true);
  assert.deepEqual(registryRequests.sort(), ['/current-plugin', '/fixture-plugin', '/ranged-plugin']);
  while (!output.includes('ranged-plugin@^1.0.0: 1.0.0 -> 1.2.0')) {
    assert.ok(Date.now() < deadline, `Removal was not logged: ${output}`);
    await delay(POLL_INTERVAL_MS);
  }
  assert.match(output, /fixture-plugin@latest: 1\.0\.0 -> 2\.0\.0/);
});
