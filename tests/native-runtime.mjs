import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maxSatisfying, minSatisfying, satisfies, valid } from 'semver';

export function selectVersion(versions, range, mode) {
  assert.ok(['latest', 'minimum'].includes(mode), `Unknown native selection: ${mode}`);
  assert.ok(Array.isArray(versions) && versions.every((version) => typeof version === 'string'));
  const version = (mode === 'minimum' ? minSatisfying : maxSatisfying)(versions, range);
  assert.ok(version !== null, `No published OpenCode version satisfies ${range}`);
  return version;
}

export function verifyVersion(output, expected, range) {
  const actual = output.trim();
  assert.ok(
    valid(actual) !== null && actual === expected && satisfies(actual, range),
    `Native OpenCode ${actual} does not match selected ${expected} in ${range}`,
  );
}

export async function withNativeRuntime(mode, action) {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const range = manifest.engines.opencode;
  assert.equal(process.arch, 'x64', 'Native test installation requires x64');
  assert.ok(['linux', 'win32'].includes(process.platform), 'Native tests support Linux and Windows');
  const nativePackage = process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-linux-x64';
  const root = await mkdtemp(join(tmpdir(), 'opencode-native-runtime-'));
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli !== undefined, 'Run native tests through npm');
  const env = {
    ...process.env,
    npm_config_cache: join(root, 'npm-cache'),
    npm_config_offline: 'false',
    npm_config_prefer_offline: 'false',
    npm_config_prefer_online: 'true',
    npm_config_registry: 'https://registry.npmjs.org',
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_CACHE_HOME: join(root, 'cache'),
    OPENCODE_TEST_HOME: root,
    OPENCODE_DB: join(root, 'db.sqlite'),
  };
  const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { env, encoding: 'utf8', timeout: 180_000, ...options });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${command} failed: ${result.stderr ?? ''}`);
    return result.stdout;
  };
  try {
    const versions = JSON.parse(run(process.execPath, [npmCli, 'view', 'opencode-ai', 'versions', '--json']));
    const version = selectVersion(versions, range, mode);
    console.log(`Native OpenCode: selected ${version} (${mode}, supported ${range})`);
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
    const binary = join(
      root,
      'node_modules',
      nativePackage,
      'bin',
      process.platform === 'win32' ? 'opencode.exe' : 'opencode',
    );
    verifyVersion(run(binary, ['--version']), version, range);
    console.log(`Native OpenCode: verified ${version} at ${binary}`);
    await action({ ...env, OPENCODE_BIN: binary, OPENCODE_NATIVE_VERSION: version });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
