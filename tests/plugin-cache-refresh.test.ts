import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  type OutdatedPackage,
  defaultPackagesDirectory,
  discardPackages,
  findOutdatedPackages,
  nerfDart,
  npmSettings,
  parseCacheEntry,
  parseNpmrc,
  registryAuthorization,
  registryPackument,
  resolveSpec,
} from '../extensions/plugin-cache/refresh.ts';
import { startPluginCacheRefresh } from '../extensions/plugin-cache/runner.ts';

async function packagesFixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'plugin-cache-refresh-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const install = async (entry: string, name: string, version: string) => {
    const directory = join(root, ...entry.split('/'), 'node_modules', ...name.split('/'));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version }));
  };
  return { root, install };
}

async function registryFixture(t: TestContext, packuments: Partial<Record<string, Record<string, string>>>) {
  const requests: { url: string | undefined; accept: string | undefined; authorization: string | undefined }[] = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, accept: request.headers.accept, authorization: request.headers.authorization });
    if (request.url === '/redirected') {
      response.statusCode = 302;
      response.setHeader('location', '/plugin');
      response.end();
      return;
    }
    const tags = packuments[request.url ?? ''];
    response.setHeader('content-type', 'application/json');
    if (tags === undefined) {
      response.statusCode = 404;
      response.end('{}');
      return;
    }
    response.end(JSON.stringify({ 'dist-tags': { ...tags, broken: 4 } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  return { url: `http://127.0.0.1:${String(address.port)}`, requests };
}

const tagsOnly = (distTags: Record<string, string>) => ({ distTags, versions: [] });

const exists = async (directory: string, entry: string) => (await readdir(directory)).includes(entry);
const noWarning = () => assert.fail('No warning expected');

test('cache entries are parsed for dist-tag and range specs, not exact versions', () => {
  assert.deepEqual(parseCacheEntry('plugin@latest'), { name: 'plugin', spec: 'latest', kind: 'tag' });
  assert.deepEqual(parseCacheEntry('@scope/plugin@next'), { name: '@scope/plugin', spec: 'next', kind: 'tag' });
  assert.deepEqual(parseCacheEntry('plugin@beta.2'), { name: 'plugin', spec: 'beta.2', kind: 'tag' });
  for (const range of ['^1.2.0', '~1', 'v1.2', 'x', 'X', '*', '>=1', '1.x', '>=1.2.0 <2']) {
    assert.deepEqual(parseCacheEntry(`plugin@${range}`), { name: 'plugin', spec: range, kind: 'range' }, range);
  }
  assert.deepEqual(parseCacheEntry('@scope/plugin@^0.3.2'), { name: '@scope/plugin', spec: '^0.3.2', kind: 'range' });
  for (const entry of [
    'plugin',
    '@scope/plugin',
    'plugin@1.2.3',
    'plugin@_=1',
    'plugin@X.1',
    'plugin@=1.2.3',
    'plugin@_=1.0.0',
    'plugin@1.x __ 2.x',
    'alias@npm:plugin@1.0.0',
    'alias@npm_plugin@1.0.0',
    'plugin@github:owner/repo',
    '.stale',
  ]) {
    assert.equal(parseCacheEntry(entry), undefined, entry);
  }
});

test('the cache directory follows XDG_CACHE_HOME, treats an empty value as unset, and drops newlines', () => {
  assert.equal(defaultPackagesDirectory({ XDG_CACHE_HOME: '/cache\n' }), join('/cache', 'kilo', 'packages'));
  assert.equal(defaultPackagesDirectory({ XDG_CACHE_HOME: '/cache' }), join('/cache', 'kilo', 'packages'));
  const fallback = join(homedir(), '.cache', 'kilo', 'packages');
  assert.equal(defaultPackagesDirectory({}), fallback);
  assert.equal(defaultPackagesDirectory({ XDG_CACHE_HOME: '' }), fallback);
});

test('npmrc registry, scope registry, and credential settings are read and other keys are ignored', () => {
  const text = [
    '; comment',
    '# comment',
    'registry = "https://mirror.example.test/npm/"',
    '@scope:registry=${SCOPE_REGISTRY}/',
    '//mirror.example.test/npm/:_authToken=${NPM_TOKEN}',
    '//basic.example.test/:_auth=c3ludGhldGljOnBhc3N3b3Jk',
    '//other.example.test/:username=synthetic',
    'email=synthetic@example.test',
  ].join('\r\n');
  assert.deepEqual(parseNpmrc(text, { SCOPE_REGISTRY: 'https://scope.example.test', NPM_TOKEN: 'synthetic-token' }), {
    registry: 'https://mirror.example.test/npm',
    scopes: { '@scope': 'https://scope.example.test' },
    credentials: {
      '//mirror.example.test/npm/': 'Bearer synthetic-token',
      '//basic.example.test/': 'Basic c3ludGhldGljOnBhc3N3b3Jk',
    },
  });
  assert.deepEqual(parseNpmrc('', {}), { registry: 'https://registry.npmjs.org', scopes: {}, credentials: {} });
});

test('npm settings come from ~/.npmrc, with npm defaults when it is missing', async (t) => {
  const { root } = await packagesFixture(t);
  assert.deepEqual(npmSettings(root), { registry: 'https://registry.npmjs.org', scopes: {}, credentials: {} });
  await writeFile(join(root, '.npmrc'), 'registry=https://artifactory.example.test/api/npm/npm/\n');
  assert.equal(npmSettings(root).registry, 'https://artifactory.example.test/api/npm/npm');
});

test('registry credentials match the registry path and then its parent paths on the same host', () => {
  const settings = {
    registry: 'https://registry.example.test',
    scopes: {},
    credentials: {
      '//npm.example.test/api/npm/': 'Bearer synthetic-path',
      '//host.example.test/': 'Bearer synthetic-host',
      '//port.example.test:8443/': 'Basic c3ludGhldGljOnBvcnQ=',
    },
  };
  assert.equal(registryAuthorization(settings, 'https://npm.example.test/api/npm'), 'Bearer synthetic-path');
  assert.equal(registryAuthorization(settings, 'https://npm.example.test/api/npm/virtual/'), 'Bearer synthetic-path');
  assert.equal(registryAuthorization(settings, 'https://npm.example.test/api'), undefined);
  assert.equal(registryAuthorization(settings, 'https://host.example.test/a/b'), 'Bearer synthetic-host');
  assert.equal(registryAuthorization(settings, 'https://port.example.test:8443'), 'Basic c3ludGhldGljOnBvcnQ=');
  assert.equal(registryAuthorization(settings, 'https://port.example.test'), undefined);
  assert.equal(registryAuthorization(settings, 'https://other.example.test'), undefined);
  assert.equal(registryAuthorization(settings, 'not a url'), undefined);
});

test('only cached tag and range installs whose spec names another version are reported', async (t) => {
  const { root, install } = await packagesFixture(t);
  await install('stale@latest', 'stale', '1.0.0');
  await install('current@latest', 'current', '2.0.0');
  await install('@scope/scoped@next', '@scope/scoped', '3.0.0-next.1');
  await install('pinned@1.0.0', 'pinned', '1.0.0');
  await install('ranged@^1.0.0', 'ranged', '1.0.0');
  await install('missing-tag@canary', 'missing-tag', '0.1.0');
  await install('@ai-sdk/openai-compatible', '@ai-sdk/openai-compatible', '1.0.0');
  await install('pyright', 'pyright', '1.0.0');
  await mkdir(join(root, 'incomplete@latest'));
  const requested: string[] = [];
  const tags: Partial<Record<string, Record<string, string>>> = {
    stale: { latest: '1.1.0' },
    current: { latest: '2.0.0' },
    '@scope/scoped': { latest: '2.0.0', next: '3.0.0-next.2' },
    'missing-tag': { latest: '1.0.0' },
  };
  const outdated = await findOutdatedPackages({
    packagesDirectory: root,
    fetchPackument: (name) => {
      requested.push(name);
      const distTags = tags[name];
      return Promise.resolve(distTags === undefined ? undefined : tagsOnly(distTags));
    },
    warn: noWarning,
  });
  assert.deepEqual(outdated.map((entry) => [entry.entry, entry.installedVersion, entry.availableVersion]).sort(), [
    ['@scope/scoped@next', '3.0.0-next.1', '3.0.0-next.2'],
    ['stale@latest', '1.0.0', '1.1.0'],
  ]);
  assert.deepEqual(requested.sort(), ['@scope/scoped', 'current', 'missing-tag', 'ranged', 'stale']);
  assert.equal(await exists(root, 'stale@latest'), true, 'Finding outdated packages must not remove them');
});

test('registry failures keep the cached package and report a warning', async (t) => {
  const { root, install } = await packagesFixture(t);
  await install('offline@latest', 'offline', '1.0.0');
  await install('unknown@latest', 'unknown', '1.0.0');
  const warnings: unknown[] = [];
  const outdated = await findOutdatedPackages({
    packagesDirectory: root,
    fetchPackument: (name) => (name === 'offline' ? Promise.reject(new Error('offline')) : Promise.resolve(undefined)),
    warn: (_message, extra) => {
      warnings.push(extra);
    },
  });
  assert.deepEqual(outdated, []);
  assert.deepEqual(warnings, [{ package: 'offline@latest', error: 'offline' }]);
});

test('a missing cache directory reports nothing', async () => {
  const outdated = await findOutdatedPackages({
    packagesDirectory: join(tmpdir(), `plugin-cache-refresh-missing-${String(process.pid)}-${String(Date.now())}`),
    fetchPackument: () => assert.fail('No registry request expected'),
    warn: noWarning,
  });
  assert.deepEqual(outdated, []);
});

test('discarded packages are removed whole', async (t) => {
  const { root, install } = await packagesFixture(t);
  await install('stale@latest', 'stale', '1.0.0');
  const outdated = await findOutdatedPackages({
    packagesDirectory: root,
    fetchPackument: () => Promise.resolve(tagsOnly({ latest: '1.1.0' })),
    warn: noWarning,
  });
  assert.deepEqual(discardPackages(root, outdated), ['stale@latest']);
  assert.equal(await exists(root, 'stale@latest'), false);
  assert.deepEqual(await readdir(join(root, '.stale')), []);
  await findOutdatedPackages({
    packagesDirectory: root,
    fetchPackument: () => Promise.resolve(undefined),
    warn: noWarning,
  });
  assert.equal(await exists(root, '.stale'), false);
});

test('a package that cannot be moved stays in place', async (t) => {
  const { root } = await packagesFixture(t);
  const missing: OutdatedPackage = {
    name: 'gone',
    spec: 'latest',
    kind: 'tag',
    entry: 'gone@latest',
    directory: join(root, 'gone@latest'),
    installedVersion: '1.0.0',
    availableVersion: '1.1.0',
  };
  assert.deepEqual(discardPackages(root, [missing]), []);
});

test('registry packuments use the scope registry, its credential, and the abbreviated packument', async (t) => {
  const main = await registryFixture(t, { '/plugin': { latest: '1.0.0' } });
  const scoped = await registryFixture(t, { '/@scope%2fplugin': { latest: '1.2.3' } });
  const fetchPackument = registryPackument({
    registry: main.url,
    scopes: { '@scope': scoped.url },
    credentials: { [String(nerfDart(scoped.url))]: 'Bearer synthetic-scope' },
  });
  assert.deepEqual(await fetchPackument('@scope/plugin'), tagsOnly({ latest: '1.2.3' }));
  assert.deepEqual(await fetchPackument('plugin'), tagsOnly({ latest: '1.0.0' }));
  assert.equal(await fetchPackument('missing'), undefined);
  assert.equal(await fetchPackument('redirected'), undefined);
  assert.deepEqual(scoped.requests, [
    {
      url: '/@scope%2fplugin',
      accept: 'application/vnd.npm.install-v1+json',
      authorization: 'Bearer synthetic-scope',
    },
  ]);
  assert.deepEqual(
    main.requests.map((request) => [request.url, request.authorization]),
    [
      ['/plugin', undefined],
      ['/missing', undefined],
      ['/redirected', undefined],
    ],
  );
});

test('a package reinstalled after the check is not removed', async (t) => {
  const { root, install } = await packagesFixture(t);
  await install('stale@latest', 'stale', '1.0.0');
  const outdated = await findOutdatedPackages({
    packagesDirectory: root,
    fetchPackument: () => Promise.resolve(tagsOnly({ latest: '2.0.0' })),
    warn: noWarning,
  });
  await install('stale@latest', 'stale', '2.0.0');
  assert.deepEqual(discardPackages(root, outdated), []);
  assert.equal(await exists(root, 'stale@latest'), true);
});

test('the refresh checks once per process, removes outdated packages, and asks for a restart', async (t) => {
  const { root, install } = await packagesFixture(t);
  const packages = join(root, 'cache', 'kilo', 'packages');
  await install('cache/kilo/packages/stale@latest', 'stale', '1.0.0');
  await install('cache/kilo/packages/current@latest', 'current', '1.0.0');
  const registry = await registryFixture(t, { '/stale': { latest: '2.0.0' }, '/current': { latest: '1.0.0' } });
  const names = ['XDG_CACHE_HOME', 'HOME', 'USERPROFILE'] as const;
  const previous = names.map((name) => [name, process.env[name]] as const);
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
      } else {
        process.env[name] = value;
      }
    }
  });
  process.env.XDG_CACHE_HOME = join(root, 'cache');
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  await writeFile(join(root, '.npmrc'), `registry=${registry.url}\n`);
  const logs: unknown[] = [];
  const toasts: unknown[] = [];
  const log = (level: string, message: string, extra: Record<string, unknown>) => {
    logs.push({ level, message, extra });
    return Promise.resolve();
  };
  const notify = (message: string) => {
    toasts.push(message);
    return Promise.resolve();
  };
  startPluginCacheRefresh(log, notify, { removalDelayMs: 0 });
  startPluginCacheRefresh(log, notify, { removalDelayMs: 0 });
  for (let attempt = 0; attempt < 200 && toasts.length === 0; attempt++) {
    await delay(20);
  }
  assert.equal(await exists(packages, 'stale@latest'), false);
  assert.equal(await exists(packages, 'current@latest'), true);
  assert.deepEqual(registry.requests.map((request) => request.url).sort(), ['/current', '/stale']);
  assert.deepEqual(logs, [
    {
      level: 'info',
      message: 'Removed outdated cached plugin packages; the next start installs the new versions',
      extra: { packages: ['stale@latest: 1.0.0 -> 2.0.0'] },
    },
  ]);
  assert.deepEqual(toasts, ['Plugin updates are ready. Restart Kilo to load them.']);
});

test('ranges resolve like npm: latest when it satisfies the range, otherwise the highest non-deprecated match', () => {
  const packument = {
    distTags: { latest: '2.1.0', next: '3.0.0-next.1' },
    versions: [
      { version: '1.0.0', deprecated: false },
      { version: '1.4.0', deprecated: false },
      { version: '1.5.0', deprecated: true },
      { version: '1.6.0-beta.1', deprecated: false },
      { version: '2.0.0', deprecated: false },
      { version: '2.1.0', deprecated: false },
      { version: '2.2.0', deprecated: false },
      { version: '3.0.0-next.1', deprecated: false },
    ],
  };
  const range = (spec: string) => resolveSpec(packument, { spec, kind: 'range' });
  assert.equal(range('^2.0.0'), '2.1.0', 'latest wins over a higher match');
  assert.equal(range('^1.0.0'), '1.4.0', 'deprecated and prerelease versions are skipped');
  assert.equal(range('1.5.x'), '1.5.0', 'a deprecated version is used when nothing else matches');
  assert.equal(range('x'), '2.1.0');
  assert.equal(range('^4.0.0'), undefined);
  assert.equal(resolveSpec(packument, { spec: 'next', kind: 'tag' }), '3.0.0-next.1');
  assert.equal(resolveSpec(packument, { spec: 'missing', kind: 'tag' }), undefined);
});

test('a cached range install is reported when the range now resolves to another version', async (t) => {
  const { root, install } = await packagesFixture(t);
  await install('ranged@^1.0.0', 'ranged', '1.0.0');
  await install('@scope/current@^2.0.0', '@scope/current', '2.1.0');
  const versions = (...list: string[]) => list.map((version) => ({ version, deprecated: false }));
  const packuments: Record<
    string,
    { distTags: Record<string, string>; versions: { version: string; deprecated: boolean }[] }
  > = {
    ranged: { distTags: { latest: '2.0.0' }, versions: versions('1.0.0', '1.3.0', '2.0.0') },
    '@scope/current': { distTags: { latest: '2.1.0' }, versions: versions('2.0.0', '2.1.0') },
  };
  const outdated = await findOutdatedPackages({
    packagesDirectory: root,
    fetchPackument: (name) => Promise.resolve(packuments[name]),
    warn: noWarning,
  });
  assert.deepEqual(
    outdated.map((entry) => [entry.entry, entry.kind, entry.installedVersion, entry.availableVersion]),
    [['ranged@^1.0.0', 'range', '1.0.0', '1.3.0']],
  );
});

test('registry packuments include each version and whether it is deprecated', async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        'dist-tags': { latest: '1.1.0' },
        versions: { '1.0.0': { deprecated: 'Use 1.1.0' }, '1.1.0': {}, '1.2.0': { deprecated: '' } },
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  const fetchPackument = registryPackument({
    registry: `http://127.0.0.1:${String(address.port)}`,
    scopes: {},
    credentials: {},
  });
  assert.deepEqual(await fetchPackument('plugin'), {
    distTags: { latest: '1.1.0' },
    versions: [
      { version: '1.0.0', deprecated: true },
      { version: '1.1.0', deprecated: false },
      { version: '1.2.0', deprecated: false },
    ],
  });
});

test('range resolution follows npm for deprecated, prerelease, unpublished, and engine-restricted versions', () => {
  const version = (value: string, fields: { deprecated?: boolean; node?: string } = {}) => ({
    version: value,
    deprecated: fields.deprecated ?? false,
    ...(fields.node === undefined ? {} : { node: fields.node }),
  });
  const resolve = (latest: string, versions: ReturnType<typeof version>[], spec: string, node = 'v22.18.0') =>
    resolveSpec({ distTags: { latest }, versions }, { spec, kind: 'range' }, node);
  assert.equal(
    resolve('1.3.0', [version('1.2.0'), version('1.3.0', { deprecated: true })], '^1.0.0'),
    '1.2.0',
    'a deprecated latest is skipped',
  );
  assert.equal(
    resolve('2.0.0-rc.1', [version('1.9.0'), version('2.0.0-rc.1')], '*'),
    '2.0.0-rc.1',
    'a literal * takes a prerelease latest',
  );
  assert.equal(resolve('2.0.0-rc.1', [version('1.9.0'), version('2.0.0-rc.1')], 'x'), '1.9.0');
  assert.equal(resolve('1.3.0', [version('1.2.0')], '^1.0.0'), '1.2.0', 'an unpublished latest is skipped');
  assert.equal(
    resolve('1.3.0', [version('1.2.0'), version('1.3.0', { node: '>=24' })], '^1.0.0'),
    '1.2.0',
    'a latest that needs a newer Node is skipped',
  );
  assert.equal(resolve('2.0.0', [version('1.2.0'), version('1.3.0', { node: '>=24' })], '^1.0.0', 'v24.1.0'), '1.3.0');
  assert.equal(
    resolve('2.0.0', [version('1.2.0', { deprecated: true }), version('1.3.0', { node: '>=24' })], '^1.0.0'),
    '1.2.0',
    'engine compatibility ranks above deprecation when neither version has both',
  );
});

test('an installed version with build metadata matches the registry version', async (t) => {
  const { root, install } = await packagesFixture(t);
  await install('built@latest', 'built', '1.2.3+build.5');
  const outdated = await findOutdatedPackages({
    packagesDirectory: root,
    fetchPackument: () => Promise.resolve(tagsOnly({ latest: '1.2.3' })),
    warn: noWarning,
  });
  assert.deepEqual(outdated, []);
});

test('registry packuments include the Node engine range of each version', async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        'dist-tags': { latest: '1.0.0' },
        versions: { '1.0.0': { engines: { node: '>=22' } }, '1.1.0': { engines: { npm: '>=10' } } },
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  const fetchPackument = registryPackument({
    registry: `http://127.0.0.1:${String(address.port)}`,
    scopes: {},
    credentials: {},
  });
  assert.deepEqual((await fetchPackument('plugin'))?.versions, [
    { version: '1.0.0', deprecated: false, node: '>=22' },
    { version: '1.1.0', deprecated: false },
  ]);
});
