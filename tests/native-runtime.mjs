import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maxSatisfying, satisfies, valid } from 'semver';

export function selectVersion(versions, range) {
  assert.ok(Array.isArray(versions) && versions.every((version) => typeof version === 'string'));
  const version = maxSatisfying(versions, range);
  assert.ok(version !== null, `No published Kilo version satisfies ${range}`);
  return version;
}

export function verifyVersion(output, expected, range) {
  const actual = output.trim();
  assert.ok(
    valid(actual) !== null && actual === expected && satisfies(actual, range),
    `Native Kilo ${actual} does not match selected ${expected} in ${range}`,
  );
}

export async function withNativeRuntime(action) {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const range = manifest.engines.kilo;
  assert.equal(process.arch, 'x64', 'Native test installation requires x64');
  assert.ok(['linux', 'win32'].includes(process.platform), 'Native tests support Linux and Windows');
  const nativePackage = `@kilocode/cli-${process.platform === 'win32' ? 'windows' : 'linux'}-x64-baseline`;
  const root = await mkdtemp(join(tmpdir(), 'kilo-native-runtime-'));
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli !== undefined, 'Run native tests through npm');
  const env = {
    PATH: process.env.PATH,
    ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}),
    HOME: root,
    USERPROFILE: root,
    npm_config_cache: process.env.npm_config_cache ?? join(root, 'npm-cache'),
    npm_config_userconfig: join(root, 'empty-npmrc'),
    npm_config_globalconfig: join(root, 'empty-global-npmrc'),
    npm_config_offline: 'false',
    npm_config_prefer_offline: 'false',
    npm_config_prefer_online: 'true',
    npm_config_registry: 'https://registry.npmjs.org',
    KILO_DISABLE_AUTOUPDATE: 'true',
    KILO_DISABLE_MODELS_FETCH: 'true',
    KILO_DISABLE_PROJECT_CONFIG: 'true',
    KILO_DISABLE_DEFAULT_PLUGINS: 'true',
    KILO_DISABLE_EXTERNAL_SKILLS: 'true',
    KILO_DISABLE_CLAUDE_CODE: 'true',
    KILO_EXPERIMENTAL_DISABLE_FILEWATCHER: 'true',
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_CACHE_HOME: join(root, 'cache'),
    KILO_TEST_HOME: root,
    KILO_DB: join(root, 'db.sqlite'),
  };
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'NODE_EXTRA_CA_CERTS',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'npm_config_cafile',
  ]) {
    if (process.env[name]) {
      env[name] = process.env[name];
    }
  }
  const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { env, encoding: 'utf8', timeout: 180_000, ...options });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${command} failed: ${result.stderr ?? ''}`);
    return result.stdout;
  };
  try {
    const versions = JSON.parse(run(process.execPath, [npmCli, 'view', '@kilocode/cli', 'versions', '--json']));
    const version = selectVersion(versions, range);
    console.log(`Native Kilo: selected ${version} (supported ${range})`);
    run(
      process.execPath,
      [
        npmCli,
        'install',
        '--prefix',
        root,
        '--no-save',
        '--package-lock=false',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        `${nativePackage}@${version}`,
      ],
      { stdio: 'inherit' },
    );
    const binary = join(root, 'node_modules', nativePackage, 'bin', process.platform === 'win32' ? 'kilo.exe' : 'kilo');
    verifyVersion(run(binary, ['--version']), version, range);
    console.log(`Native Kilo: verified ${version} at ${binary}`);
    await action({ ...env, KILO_BIN: binary, KILO_NATIVE_VERSION: version });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
