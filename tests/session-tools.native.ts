import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { nativeBinary } from './native-host.ts';

interface PluginStatus {
  id: string;
  source: string;
  spec: string;
  enabled: boolean;
  active: boolean;
}

test('Kilo TUI activates session inspection panels from source', { timeout: 90_000 }, async (t) => {
  if (process.platform !== 'linux' || spawnSync('script', ['--version']).status !== 0) {
    t.skip('Native TUI smoke test requires Linux util-linux script');
    return;
  }
  const binary = nativeBinary();
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(join(tmpdir(), 'kilo-session-panels-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = join(root, 'config', 'kilo');
  const project = join(root, 'project');
  await mkdir(config, { recursive: true });
  await mkdir(project);
  assert.equal(spawnSync('git', ['init', '-b', 'main'], { cwd: project }).status, 0);
  await cp(join(repository, 'extensions'), join(config, 'extensions'), { recursive: true });
  // Real copies prevent the host installer from mutating the checkout's dependencies.
  await cp(await realpath(join(repository, 'node_modules')), join(config, 'node_modules'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) {
    await cp(join(repository, file), join(config, file));
  }
  const tui = JSON.parse(await readFile(join(repository, 'tui.jsonc'), 'utf8')) as {
    plugin: (string | [string, Record<string, unknown>])[];
  };
  const entries = tui.plugin.filter((entry) => typeof entry === 'string' && entry.startsWith('./extensions/'));
  await writeFile(join(config, 'kilo.json'), JSON.stringify({ plugin: [], enabled_providers: [] }));
  await writeFile(join(config, 'tui.json'), JSON.stringify({ plugin: [...entries, './audit.js'] }));
  await writeFile(
    join(config, 'audit.js'),
    "import {writeFileSync} from 'node:fs'; export default {id:'session-panel-audit',async tui(api){for(let i=0;i<100&&!api.state.ready;i++)await new Promise(r=>setTimeout(r,50));writeFileSync(process.env.PANEL_MARKER,JSON.stringify({plugins:api.plugins.list()}));}};",
  );
  const registryRequests: string[] = [];
  const registry = createServer((request, response) => {
    registryRequests.push(request.url ?? '');
    response.writeHead(404);
    response.end('{}');
  });
  registry.listen(0, '127.0.0.1');
  await once(registry, 'listening');
  t.after(() => new Promise<void>((resolve) => registry.close(() => resolve())));
  const address = registry.address();
  assert.ok(address !== null && typeof address !== 'string');
  const marker = join(root, 'panels.json');
  // Do not inherit provider credentials, user npm configuration, or existing host caches.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: root,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: 'C.UTF-8',
    npm_config_registry: `http://127.0.0.1:${address.port}`,
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
    PANEL_MARKER: marker,
  };
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const child = spawn('script', ['-q', '-c', `${quote(binary)} --print-logs`, '/dev/null'], {
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
    let statuses: PluginStatus[] | undefined;
    for (let attempt = 0; attempt < 400; attempt++) {
      try {
        const result = JSON.parse(await readFile(marker, 'utf8')) as {
          plugins: PluginStatus[];
        };
        statuses = result.plugins;
        break;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error;
        }
      }
      if (!running()) {
        break;
      }
      await delay(100);
    }
    assert.ok(statuses !== undefined, `Native TUI did not complete panel activation: ${logs}`);
    const panels = statuses.filter((status) => status.spec.includes('/extensions/'));
    assert.deepEqual(
      panels.map((status) => status.id),
      ['effective-config', 'context-inspector', 'session-bookmarks'],
    );
    assert.ok(panels.every((status) => status.active && status.enabled && status.source === 'file'));
    assert.deepEqual(registryRequests, [], 'Source panels must load using the installed fixture dependencies');
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
});
