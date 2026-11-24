import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
const CTRL_C = '\u0003';

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

test(
  'native TUI reports outdated tag and range packages and removes them after the user quits',
  { timeout: 90_000 },
  async (t) => {
    if (process.platform !== 'linux' || spawnSync('script', ['--version']).status !== 0) {
      t.skip('Native TUI test requires Linux util-linux script');
      return;
    }
    const binary = nativeBinary();
    const repository = fileURLToPath(new URL('../', import.meta.url));
    const root = await mkdtemp(join(tmpdir(), 'kilo-plugin-cache-native-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const config = join(root, 'config', 'kilo');
    const project = join(root, 'project');
    const packages = join(root, 'cache', 'kilo', 'packages');
    const outdated = join(packages, 'fixture-plugin@latest');
    const current = join(packages, 'current-plugin@latest');
    const ranged = join(packages, 'ranged-plugin@^1.0.0');
    await mkdir(join(config, 'plugins'), { recursive: true });
    await mkdir(project);
    assert.equal(spawnSync('git', ['init', '-b', 'main'], { cwd: project }).status, 0);
    await cp(
      join(repository, 'plugins', 'plugin-cache-refresh.ts'),
      join(config, 'plugins', 'plugin-cache-refresh.ts'),
    );
    await cp(join(repository, 'extensions'), join(config, 'extensions'), { recursive: true });
    // Real copies prevent the host installer from mutating the checkout's dependencies.
    await cp(await realpath(join(repository, 'node_modules')), join(config, 'node_modules'), { recursive: true });
    for (const file of ['package.json', 'package-lock.json']) {
      await cp(join(repository, file), join(config, file));
    }
    await writeFile(join(config, 'kilo.json'), JSON.stringify({ plugin: [], enabled_providers: [] }));
    await writeFile(join(config, 'tui.json'), JSON.stringify({ plugin: ['./extensions/plugin-cache/tui.ts'] }));
    for (const [directory, name] of [
      [outdated, 'fixture-plugin'],
      [current, 'current-plugin'],
      [ranged, 'ranged-plugin'],
    ] as const) {
      await mkdir(join(directory, 'node_modules', name), { recursive: true });
      await writeFile(
        join(directory, 'node_modules', name, 'package.json'),
        JSON.stringify({ name, version: '1.0.0' }),
      );
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

    // Do not inherit provider credentials, user npm configuration, or existing host caches.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: root,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'C.UTF-8',
      npm_config_registry: `http://127.0.0.1:${String(address.port)}`,
      npm_config_userconfig: join(root, 'empty-npmrc'),
      npm_config_globalconfig: join(root, 'empty-global-npmrc'),
      npm_config_cache: join(root, 'npm-cache'),
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_fetch_retries: '0',
      npm_config_update_notifier: 'false',
      KILO_TEST_HOME: root,
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_DATA_HOME: join(root, 'data'),
      XDG_CACHE_HOME: join(root, 'cache'),
      XDG_STATE_HOME: join(root, 'state'),
      KILO_DB: join(root, 'db.sqlite'),
      KILO_DISABLE_AUTOUPDATE: 'true',
      KILO_DISABLE_MODELS_FETCH: 'true',
      KILO_DISABLE_PROJECT_CONFIG: 'true',
      KILO_DISABLE_DEFAULT_PLUGINS: 'true',
      KILO_DISABLE_EXTERNAL_SKILLS: 'true',
      KILO_DISABLE_CLAUDE_CODE: 'true',
      KILO_EXPERIMENTAL_DISABLE_FILEWATCHER: 'true',
    };
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    const child = spawn('script', ['-q', '-c', `${quote(binary)} --print-logs --log-level INFO`, '/dev/null'], {
      cwd: project,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });
    const running = () => child.exitCode === null && child.signalCode === null;
    let logs = '';
    child.stdout.on('data', (chunk: Buffer) => {
      logs += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      logs += chunk.toString();
    });
    try {
      const deadline = Date.now() + TIMEOUT_MS;
      while (
        !logs.includes('fixture-plugin@latest: 1.0.0 -> 2.0.0') ||
        !logs.includes('ranged-plugin@^1.0.0: 1.0.0 -> 1.2.0')
      ) {
        assert.ok(running() && Date.now() < deadline, `Outdated package was not reported: ${logs}`);
        await delay(POLL_INTERVAL_MS);
      }
      // The running TUI keeps the outdated files; they are removed when it exits.
      assert.equal(await exists(outdated), true);
      assert.equal(await exists(ranged), true);
      // The server plugin in the TUI's worker thread must not check the registry again.
      await delay(1_000);
      assert.deepEqual(registryRequests.sort(), ['/current-plugin', '/fixture-plugin', '/ranged-plugin']);
      while (running()) {
        assert.ok(Date.now() < deadline, `TUI did not exit: ${logs}`);
        child.stdin.write(CTRL_C);
        await Promise.race([once(child, 'exit'), delay(1_000)]);
      }
      assert.equal(await exists(outdated), false, `Outdated package was not removed at exit: ${logs}`);
      assert.equal(await exists(ranged), false, `Outdated range package was not removed at exit: ${logs}`);
      assert.equal(await exists(current), true);
    } finally {
      if (running() && child.pid !== undefined) {
        process.kill(-child.pid, 'SIGTERM');
        await Promise.race([once(child, 'exit'), delay(2000)]);
        if (running()) {
          process.kill(-child.pid, 'SIGKILL');
          await once(child, 'exit');
        }
      }
    }
  },
);
