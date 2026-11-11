import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = '7.8.27';
assert.equal(process.arch, 'x64', 'Native smoke installation requires x64.');
assert.ok(['linux', 'win32'].includes(process.platform), 'Native smoke installation supports Linux and Windows.');
const nativePackage = `@kilocode/cli-${process.platform === 'win32' ? 'windows' : 'linux'}-x64-baseline`;
const repository = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'kilo-native-'));
const installation = join(root, 'config', 'kilo');
const project = join(root, 'project');
const runtime = join(root, 'runtime');
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run the native smoke test through npm.');
const env = {
  PATH: process.env.PATH,
  ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}),
  HOME: root,
  USERPROFILE: root,
  TMPDIR: join(root, 'tmp'),
  TEMP: join(root, 'tmp'),
  TMP: join(root, 'tmp'),
  XDG_CONFIG_HOME: join(root, 'config'),
  XDG_DATA_HOME: join(root, 'data'),
  XDG_STATE_HOME: join(root, 'state'),
  XDG_CACHE_HOME: join(root, 'cache'),
  KILO_TEST_HOME: root,
  KILO_DB: join(root, 'kilo.sqlite'),
  KILO_DISABLE_AUTOUPDATE: 'true',
  KILO_DISABLE_MODELS_FETCH: 'true',
  KILO_DISABLE_PROJECT_CONFIG: 'true',
  KILO_DISABLE_DEFAULT_PLUGINS: 'true',
  KILO_DISABLE_EXTERNAL_SKILLS: 'true',
  KILO_DISABLE_CLAUDE_CODE: 'true',
  KILO_EXPERIMENTAL_DISABLE_FILEWATCHER: 'true',
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: project,
    env,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  assert.ifError(result.error && new Error(`${result.error.message}\n${result.stderr ?? ''}\n${result.stdout ?? ''}`));
  return result;
};

const success = (result) => {
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.doesNotMatch(result.stderr, /failed to (?:load|install) plugin|plugin config hook failed/i);
  return result.stdout;
};

try {
  await mkdir(join(installation, 'agents'), { recursive: true });
  await mkdir(project);
  await mkdir(runtime);
  await mkdir(env.TMPDIR);
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
  const cache = process.env.npm_config_cache ?? join(root, 'npm-cache');
  const npmOptions = { cwd: runtime, env, timeout: 180_000 };
  const published = JSON.parse(
    success(
      run(
        process.execPath,
        [npmCli, 'view', `@kilocode/cli@${version}`, 'version', '--json', '--cache', cache],
        npmOptions,
      ),
    ),
  );
  assert.equal(published, version);
  console.log(`Kilo native smoke: installing published ${version} in isolated temporary state.`);
  success(
    run(
      process.execPath,
      [
        npmCli,
        'install',
        '--prefix',
        runtime,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--cache',
        cache,
        `${nativePackage}@${version}`,
      ],
      npmOptions,
    ),
  );
  const binary = join(
    runtime,
    'node_modules',
    nativePackage,
    'bin',
    process.platform === 'win32' ? 'kilo.exe' : 'kilo',
  );
  assert.equal(success(run(binary, ['--version'])).trim(), version);
  console.log(`Kilo native smoke: verified ${version}; preparing local plugin fixtures.`);
  const helpResult = run(binary, ['debug', 'agent', '--help']);
  const help = success(helpResult) + helpResult.stderr;
  assert.match(help, /--tool/);
  assert.match(help, /--params/);

  for (const path of ['plugins', 'extensions']) {
    await cp(join(repository, path), join(installation, path), { recursive: true });
  }
  await cp(await realpath(join(repository, 'node_modules')), join(installation, 'node_modules'), { recursive: true });
  for (const path of ['package.json', 'package-lock.json']) {
    await cp(join(repository, path), join(installation, path));
  }
  success(
    run(
      process.execPath,
      [
        npmCli,
        'install',
        '--prefix',
        installation,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--cache',
        cache,
        `@kilocode/plugin@${version}`,
      ],
      npmOptions,
    ),
  );
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
  await writeFile(
    join(installation, 'agents', 'inspection-reader.md'),
    '---\ndescription: Native inspection fixture\nmode: subagent\n---\nRead-only fixture.',
  );
  await writeFile(
    join(installation, 'agents', 'inspection-denied.md'),
    '---\ndescription: Native denial fixture\nmode: subagent\npermission:\n  git_inspect: deny\n---\nRead-only fixture.',
  );
  success(run('git', ['init', '--quiet']));
  await writeFile(join(project, 'app.txt'), 'public-native-fixture\n');
  await writeFile(join(project, '.env'), 'PRIVATE=synthetic-native-secret\n');
  await writeFile(join(project, 'package.json'), JSON.stringify({ scripts: { fixture: 'node --version' } }));
  success(run('git', ['add', '.']));
  success(
    run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture']),
  );

  console.log('Kilo native smoke: checking discovery and custom tools.');
  const config = JSON.parse(success(run(binary, ['--print-logs', '--log-level', 'DEBUG', 'debug', 'config'])));
  for (const file of [
    'block-secrets.ts',
    'comment-guard.ts',
    'compaction-task-state.ts',
    'git-inspect.ts',
    'project-script.ts',
    'scrub-secrets.ts',
  ]) {
    assert.ok(
      config.plugin.some((specifier) => typeof specifier === 'string' && specifier.endsWith(`/plugins/${file}`)),
    );
  }
  assert.ok(config.plugin.every((specifier) => typeof specifier === 'string' && specifier.startsWith('file:')));
  const agent = JSON.parse(success(run(binary, ['debug', 'agent', 'inspection-reader'])));
  assert.equal(agent.tools.git_inspect, true);
  assert.equal(agent.tools.project_script, true);
  const tool = (name, params, agentName = 'inspection-reader') =>
    run(binary, ['debug', 'agent', agentName, '--tool', name, '--params', JSON.stringify(params)]);
  assert.match(success(tool('git_inspect', { operation: 'show', revision: 'HEAD:app.txt' })), /public-native-fixture/);
  assert.match(success(tool('project_script', {})), /npm:fixture/);
  const secret = tool('git_inspect', { operation: 'show', revision: 'HEAD:.env' });
  assert.notEqual(secret.status, 0);
  assert.match(secret.stderr, /sensitive/);
  assert.doesNotMatch(secret.stdout + secret.stderr, /synthetic-native-secret/);
  const denied = tool('git_inspect', { operation: 'show', revision: 'HEAD:app.txt' }, 'inspection-denied');
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /disabled for agent/);
  assert.doesNotMatch(denied.stdout, /public-native-fixture/);
  console.log(
    `PASS Kilo ${version}: local plugin discovery, custom tools, secret-path rejection, and per-agent denial.`,
  );
  console.log('Model-assisted execution and lifecycle hooks are not covered by this smoke test.');
} finally {
  await rm(root, { recursive: true, force: true });
}
