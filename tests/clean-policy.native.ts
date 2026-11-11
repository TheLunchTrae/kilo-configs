import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'jsonc-parser';
import { nativeBinary } from './native-host.ts';

test('native shell policy permits bounded dry runs and rejects destructive commands', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('The inert /bin/false shell fixture requires Linux.');
    return;
  }
  const binary = nativeBinary();
  const root = await mkdtemp(join(tmpdir(), 'opencode-clean-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = parse(await readFile(new URL('../kilo.jsonc', import.meta.url), 'utf8')) as {
    permission: Record<string, unknown>;
  };
  await writeFile(
    join(root, 'opencode.json'),
    JSON.stringify({
      // The native parser and permission evaluator run, but no command can execute.
      shell: '/bin/false',
      permission: config.permission,
      model: 'openai/gpt-4o',
      provider: { openai: { options: { apiKey: 'synthetic-test-key', baseURL: 'http://127.0.0.1:1/v1' } } },
    }),
  );
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_CACHE_HOME: join(root, 'cache'),
    OPENCODE_TEST_HOME: root,
    OPENCODE_DB: join(root, 'db.sqlite'),
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_MODELS_FETCH: '1',
    OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
  };
  const cases: [string, boolean][] = [
    ['git clean -n', true],
    ['git clean --dry-run', true],
    ['git clean -dn', true],
    ['git clean -d -n', true],
    ['git clean -d --dry-run', true],
    ['git clean -xdn', true],
    ['git clean -fdn', true],
    ['git clean -dn -- build', true],
    ['git clean -d --dry-run build', true],
    ['git clean', false],
    ['git clean -f', false],
    ['git clean -xdf', false],
    ['git clean --force', false],
    ['git clean -n --no-dry-run -f', false],
    ['git clean -dn --no-dry-run -f', false],
    ['git clean -d --dry-run --no-dry -f', false],
    ['git clean -f -- -n', false],
    ['git clean -f -e -n', false],
    ['git clean -f -e "--dry-run"', false],
    ['git clean -dn; git clean -f', false],
    ['git clean -dn && git clean -f', false],
    ['git branch topic -D', false],
    ['git branch topic -D another-topic', false],
    ['git push origin main -f', false],
    ['git push origin main -f another-ref', false],
  ];
  for (const [command, eligible] of cases) {
    await t.test(command, () => {
      // debug agent enforces deny via the native matcher; ask does not prompt here.
      const result = spawnSync(
        binary,
        [
          'debug',
          'agent',
          'build',
          '--pure',
          '--tool',
          'bash',
          '--params',
          JSON.stringify({ command, description: command }),
        ],
        { cwd: root, env, encoding: 'utf8', timeout: 30_000 },
      );
      assert.ifError(result.error);
      if (eligible) {
        assert.equal(result.status, 0, `${command}: ${result.stderr}`);
        assert.match(result.stdout, /"tool": "bash"/);
      } else {
        assert.notEqual(result.status, 0, `${command}: destructive command reached shell`);
        assert.match(result.stderr, /permission|ruleset/i);
      }
    });
  }
});
