import type { PluginInput } from '@kilocode/plugin';
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { BlockSecretsPlugin } from '../plugins/block-secrets.ts';

type ShowToastMock = ReturnType<typeof mock.fn<() => Promise<{ data: undefined }>>>;

const createHook = async (showToast: ShowToastMock = mock.fn(async () => ({ data: undefined }))) => {
  const input = {
    client: { tui: { showToast } },
  } as unknown as PluginInput;
  const hooks = await BlockSecretsPlugin(input);
  const hook = hooks['tool.execute.before'];
  assert.ok(hook !== undefined);
  return { hook, showToast };
};

const runTool = async (tool: string, args: Record<string, unknown> | undefined, showToast?: ShowToastMock) => {
  const created = await createHook(showToast);
  await created.hook({ tool, sessionID: 'test-session', callID: 'test-call' }, { args });
  return created;
};

const assertBlocked = async (tool: string, args: Record<string, unknown>, rawPath: string) => {
  const { hook, showToast } = await createHook();
  await assert.rejects(hook({ tool, sessionID: 'test-session', callID: 'test-call' }, { args }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /blocked by block-secrets plugin/);
    assert.ok(error.message.includes(rawPath));
    return true;
  });
  assert.equal(showToast.mock.callCount(), 1);
};

describe('block-secrets plugin', () => {
  it('blocks sensitive path patterns and allows template basenames', async () => {
    for (const path of [
      '/project/.env',
      '/project/.ENV',
      '/project/.env.local',
      '/project/private.pem',
      '/project/id_ed25519.pub',
      '/project/service.key',
      '/project/credentials.json',
      '/project/.netrc',
      '/project/secrets.yaml',
      '/project/archive.p12',
      '/project/archive.pfx',
      '/project/.aws/credentials',
      '/project/.ssh/config',
    ]) {
      await assertBlocked('read', { filePath: path }, path);
    }

    await assertBlocked('read', { file_path: '/project/.env' }, '/project/.env');

    for (const path of [
      '/project/.env.example',
      '/project/.env.sample',
      '/project/.env.template',
      '/project/.env.defaults',
      '/project/.env.dist',
    ]) {
      const { showToast } = await runTool('read', { filePath: path });
      assert.equal(showToast.mock.callCount(), 0);
    }

    const safeSource = await runTool('read', { filePath: '/project/src/index.ts' });
    assert.equal(safeSource.showToast.mock.callCount(), 0);
  });

  it('normalizes Windows, UNC, mixed-separator, case, and drive paths', async () => {
    for (const path of [
      'C:\\Work\\PRIVATE.PEM',
      '\\\\Server\\Share\\.ENV',
      'C:\\Work/mixed\\CREDENTIALS.JSON',
      'd:\\repo\\.SSH\\id_rsa',
    ]) {
      await assertBlocked('read', { path }, path);
    }

    const template = 'C:\\Work\\.ENV.EXAMPLE';
    const { showToast } = await runTool('read', { file_path: template });
    assert.equal(showToast.mock.callCount(), 0);
  });

  it('blocks secrets path segments before template allowlisting', async () => {
    for (const path of ['secrets', '/repo/secrets/value.txt', '/repo/SECRETS/.env.example']) {
      await assertBlocked('read', { filePath: path }, path);
    }

    const nearMiss = '/repo/secrets-backup/.env.example';
    const { showToast } = await runTool('read', { filePath: nearMiss });
    assert.equal(showToast.mock.callCount(), 0);
  });

  it('treats pattern as a path only for glob', async () => {
    const grep = await runTool('grep', { pattern: '(^|/)secrets(/|$)', path: '/repo/src' });
    assert.equal(grep.showToast.mock.callCount(), 0);

    await assertBlocked('grep', { pattern: 'safe', path: '/repo/secrets' }, '/repo/secrets');
    await assertBlocked('glob', { pattern: 'secrets/**/*.txt' }, 'secrets/**/*.txt');
  });

  it('checks simple quoted Bash tokens without executing commands', async () => {
    await assertBlocked('bash', { command: "read-file '/repo/.env'" }, '/repo/.env');
    await assertBlocked(
      'bash',
      { command: 'read-file "C:\\Repo\\SECRETS\\value.txt"' },
      'C:\\Repo\\SECRETS\\value.txt',
    );

    const safeCommand = await runTool('bash', { command: 'read-file /repo/src/index.ts' });
    assert.equal(safeCommand.showToast.mock.callCount(), 0);
  });

  it('checks paths after a Git revision, index stage, or option separator', async () => {
    for (const [command, path] of [
      ['git show HEAD:.env', 'HEAD:.env'],
      ['git show 1a2b3c4:.env.local', '1a2b3c4:.env.local'],
      ['git cat-file -p HEAD~2:.netrc', 'HEAD~2:.netrc'],
      ['git cat-file -p :0:.env', ':0:.env'],
      ['git show :.env', ':.env'],
      ['git -C ../app show origin/main:credentials.json', 'origin/main:credentials.json'],
      ['git show HEAD:secrets', 'HEAD:secrets'],
      ["git show 'HEAD:.env'", 'HEAD:.env'],
      ['git show HEAD:".env"', 'HEAD:.env'],
      ['git show HEAD@{1}:id_ed25519', 'HEAD@{1}:id_ed25519'],
      ['git show $(git rev-parse HEAD:.env)', 'HEAD:.env'],
      ['tool --file=.env', '--file=.env'],
    ]) {
      await assertBlocked('bash', { command }, path);
    }

    for (const command of [
      'git show HEAD:.env.example',
      'git show HEAD:src/index.ts',
      'git log --format=%H:%s',
      "git diff -- ':!.env'",
      "git diff -- ':(exclude).env'",
    ]) {
      const { showToast } = await runTool('bash', { command });
      assert.equal(showToast.mock.callCount(), 0, command);
    }
  });

  it('checks long words with many separators in linear time', async () => {
    const json = `{${Array.from({ length: 20_000 }, (_, index) => `"k${index}":${index}`).join(',')}}`;
    const started = performance.now();
    const { showToast } = await runTool('bash', { command: `printf '%s' '${json}' > data.json` });
    assert.equal(showToast.mock.callCount(), 0);
    assert.ok(performance.now() - started < 1000);

    await assertBlocked('bash', { command: `echo a:b:c:d:e:f:g:.env` }, 'a:b:c:d:e:f:g:.env');
  });

  it('splits Bash tokens at control operators', async () => {
    for (const command of ['cat .env|head', 'echo ok;cat .env', 'echo $(cat .env)', 'echo `cat .env`', 'wc<.env']) {
      await assertBlocked('bash', { command }, '.env');
    }
  });

  it('ignores missing and non-string arguments', async () => {
    for (const args of [undefined, {}, { filePath: 42 }, { pattern: false }]) {
      const { showToast } = await runTool('read', args);
      assert.equal(showToast.mock.callCount(), 0);
    }

    for (const args of [undefined, {}, { command: null }, { command: 42 }]) {
      const { showToast } = await runTool('bash', args);
      assert.equal(showToast.mock.callCount(), 0);
    }
  });

  it('does not let a rejected toast mask denial', async () => {
    const showToast = mock.fn(() => Promise.reject(new Error('toast unavailable')));
    await assert.rejects(runTool('read', { filePath: '/repo/.env' }, showToast), /blocked by block-secrets plugin/);
    assert.equal(showToast.mock.callCount(), 1);
  });
});
