import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'jsonc-parser';
import { nativeBinary } from './native-host.ts';

test('Kilo shell policy permits everyday commands and rejects destructive commands', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('The inert /bin/false shell fixture requires Linux.');
    return;
  }
  const binary = nativeBinary();
  const root = await mkdtemp(join(tmpdir(), 'kilo-clean-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = parse(await readFile(new URL('../kilo.jsonc', import.meta.url), 'utf8')) as {
    permission: Record<string, unknown>;
  };
  await writeFile(
    join(root, 'kilo.json'),
    JSON.stringify({
      // The native parser and permission evaluator run, but no command can execute.
      shell: '/bin/false',
      permission: config.permission,
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
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_CACHE_HOME: join(root, 'cache'),
    KILO_TEST_HOME: root,
    KILO_DB: join(root, 'db.sqlite'),
    KILO_DISABLE_AUTOUPDATE: 'true',
    KILO_DISABLE_MODELS_FETCH: 'true',
    KILO_DISABLE_DEFAULT_PLUGINS: 'true',
    KILO_DISABLE_EXTERNAL_SKILLS: 'true',
    KILO_DISABLE_CLAUDE_CODE: 'true',
    KILO_EXPERIMENTAL_DISABLE_FILEWATCHER: 'true',
  };
  const cases: [string, boolean][] = [
    ['wc -l README.md', true],
    ['git log --oneline | sort | uniq -c', true],
    ['git commit -m "Clean up imports and restore parser behavior"', true],
    ['git checkout -b topic', true],
    ['git restore --staged README.md', true],
    ['rm -r dist', true],
    ['gh pr create --title "Add soft delete" --body "Adds soft delete support"', true],
    ['rm -rf build', false],
    ['rm -fr build', false],
    ['echo done && rm -rf build', false],
    ['git reset --hard', false],
    ['git clean -fd', false],
    ['git filter-branch --all', false],
    ['git filter-repo --path secrets', false],
    ['gh pr merge 12 --squash', false],
    ['gh repo delete example-invalid/does-not-exist --yes', false],
    ['npm publish', false],
    ['pnpm publish', false],
    ['npm unpublish fixture@1.0.0', false],
    ['kubectl delete pod fixture', false],
  ];
  for (const [command, eligible] of cases) {
    await t.test(command, () => {
      // debug agent enforces deny via the native matcher; ask does not prompt here.
      const result = spawnSync(
        binary,
        [
          'debug',
          'agent',
          'code',
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
