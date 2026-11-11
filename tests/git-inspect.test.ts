import type { PluginInput } from '@opencode-ai/plugin';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { GitInspectPlugin } from '../plugins/git-inspect.ts';

let repository = '';
const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
  });

const inspect = async (args: Record<string, unknown>) => {
  const hooks = await GitInspectPlugin({} as PluginInput);
  const definition = hooks.tool?.git_inspect;
  assert.ok(definition !== undefined);
  const context = {
    sessionID: 'session',
    messageID: 'message',
    agent: 'code-reviewer',
    directory: repository,
    worktree: repository,
    abort: new AbortController().signal,
    metadata: () => undefined,
    ask: async () => undefined,
  };
  const result = await definition.execute(args, context);
  assert.equal(typeof result, 'string');
  return result as string;
};

describe('git_inspect tool', () => {
  before(async () => {
    repository = await mkdtemp(join(tmpdir(), 'git-inspect-'));
    git('init', '--quiet', '--initial-branch=main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    await writeFile(join(repository, 'app.txt'), 'first\n');
    await writeFile(join(repository, '.env'), 'TOKEN=synthetic-committed-value\n');
    await writeFile(join(repository, 'notes.secret'), 'plain\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'initial');
    git('checkout', '--quiet', '-b', 'feature');
    await writeFile(join(repository, 'app.txt'), 'first\nsecond\n');
    await writeFile(join(repository, '.env'), 'TOKEN=synthetic-changed-value\n');
    git('commit', '--quiet', '-am', 'feature change');
    await mkdir(join(repository, 'config', 'secrets'), { recursive: true });
    await writeFile(join(repository, 'config', 'secrets', 'db.txt'), 'synthetic-nested-value\n');
    await writeFile(join(repository, 'deploy.key'), 'synthetic-key-value\n');
    await writeFile(join(repository, '.env'), 'TOKEN=synthetic-rotated-value\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'rotate secrets only');
  });

  after(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  it('reports diffs, history, and merge bases for ordinary files', async () => {
    const diff = await inspect({ operation: 'diff', revision: 'main...feature' });
    assert.match(diff, /\+second/);
    const log = await inspect({ operation: 'log', revision: 'main..feature' });
    assert.match(log, /feature change/);
    const base = await inspect({ operation: 'merge-base', revision: 'main...feature' });
    assert.equal(base.trim(), git('rev-parse', 'main').trim());
    const blame = await inspect({ operation: 'blame', paths: ['app.txt'] });
    assert.match(blame, /second/);
    const old = await inspect({ operation: 'show', revision: 'main:app.txt' });
    assert.equal(old, 'first\n');
  });

  it('lists sensitive file names but excludes their content', async () => {
    const files = await inspect({ operation: 'changed-files', revision: 'main...feature' });
    assert.match(files, /\.env/);
    for (const args of [
      { operation: 'diff', revision: 'main...feature' },
      { operation: 'diff', revision: 'main...feature', stat: true },
      { operation: 'show' },
      { operation: 'show', revision: 'feature~1' },
      { operation: 'show', revision: 'HEAD', stat: true },
      { operation: 'show', revision: 'HEAD:' },
      { operation: 'log', revision: 'main..feature', patch: true },
      { operation: 'log', patch: true, maxCount: 5 },
    ]) {
      const output = await inspect(args);
      assert.doesNotMatch(output, /synthetic-[a-z]+-value/, JSON.stringify(args));
    }
  });

  it('shows a first-parent diffstat for merges', async () => {
    git('checkout', '--quiet', '-b', 'merge-side', 'main');
    await writeFile(join(repository, 'side.txt'), 'side\n');
    git('add', 'side.txt');
    git('commit', '--quiet', '-m', 'side change');
    git('checkout', '--quiet', 'feature');
    git('merge', '--quiet', '--no-ff', '-m', 'merge side', 'merge-side');
    try {
      const stat = await inspect({ operation: 'show', revision: 'HEAD', stat: true });
      assert.match(stat, /merge side/);
      assert.match(stat, /side\.txt/);
      assert.ok((stat.match(/\(from /g) ?? []).length <= 1, stat);
      assert.doesNotMatch(stat, /app\.txt/);
    } finally {
      git('reset', '--quiet', '--hard', 'HEAD~1');
      git('branch', '--quiet', '-D', 'merge-side');
    }
  });

  it('keeps commits whose only changes are excluded', async () => {
    const shown = await inspect({ operation: 'show', revision: 'HEAD' });
    assert.match(shown, /rotate secrets only/);
    for (const args of [{ patch: true }, { stat: true }, {}]) {
      const log = await inspect({ operation: 'log', maxCount: 3, ...args });
      assert.match(log, /rotate secrets only/, JSON.stringify(args));
      assert.match(log, /feature change/, JSON.stringify(args));
    }
  });

  it('rejects sensitive paths, option injection, and malformed revisions', async () => {
    for (const args of [
      { operation: 'show', revision: 'main:.env' },
      { operation: 'show', revision: 'HEAD:config/SECRETS/db.txt' },
      { operation: 'blame', paths: ['.env'] },
      { operation: 'diff', paths: ['keys/server.pem'] },
      { operation: 'diff', revision: '--output=/tmp/x' },
      { operation: 'show', revision: ':/rotate' },
      { operation: 'show', revision: 'HEAD~1^{/:{0}}' },
      { operation: 'show', revision: 'HEAD^{/rotate}' },
      { operation: 'show', revision: ':0:.env' },
      { operation: 'show', revision: 'HEAD:./.env' },
      { operation: 'show', revision: 'HEAD:deploy.key' },
      { operation: 'show', revision: git('rev-parse', 'HEAD:.env').trim() },
      { operation: 'log', revision: 'HEAD@{2024-01-01:00}' },
      { operation: 'log', revision: 'main feature' },
      { operation: 'show', revision: 'main..feature' },
      { operation: 'merge-base', revision: 'main' },
      { operation: 'blame', paths: [] },
    ]) {
      await assert.rejects(inspect(args), JSON.stringify(args));
    }
  });

  it('treats supplied paths literally', async () => {
    const output = await inspect({ operation: 'diff', revision: 'main...feature', paths: ['*'] });
    assert.equal(output, 'git diff: no output');
  });

  it('rejects subtree-relative reads that hide a sensitive directory', async () => {
    const subtree = git('rev-parse', 'HEAD:config/secrets').trim();
    await assert.rejects(inspect({ operation: 'show', revision: `${subtree}:db.txt` }));
  });

  it('reads commit and annotated-tag paths without weakening secret checks', async () => {
    git('tag', '-a', 'inspection-tag', '-m', 'inspection tag', 'main');
    try {
      const commit = git('rev-parse', 'main').trim();
      for (const revision of [`${commit}:app.txt`, 'inspection-tag:app.txt']) {
        assert.equal(await inspect({ operation: 'show', revision }), 'first\n');
      }
      await assert.rejects(inspect({ operation: 'show', revision: 'inspection-tag:.env' }));
    } finally {
      git('tag', '-d', 'inspection-tag');
    }
  });

  it('does not run configured text conversion or fsmonitor helpers', async () => {
    const textconv = join(repository, 'textconv-ran');
    const fsmonitor = join(repository, 'fsmonitor-ran');
    const helper = (marker: string) => `${process.execPath} -e "require('fs').writeFileSync('${marker}','')"`;
    await writeFile(join(repository, '.gitattributes'), '*.txt diff=marker\n');
    git('config', 'diff.marker.textconv', helper(textconv));
    git('config', 'core.fsmonitor', helper(fsmonitor));
    await writeFile(join(repository, 'app.txt'), 'first\nsecond\nthird\n');
    try {
      await inspect({ operation: 'status' });
      await inspect({ operation: 'diff' });
      await inspect({ operation: 'log', patch: true, maxCount: 2 });
      await inspect({ operation: 'blame', paths: ['app.txt'] });
      assert.equal(existsSync(textconv), false, 'textconv helper ran');
      assert.equal(existsSync(fsmonitor), false, 'fsmonitor helper ran');
      // Control: plain Git runs both helpers with this fixture.
      git('diff');
      git('status');
      assert.equal(existsSync(textconv), true, 'fixture textconv helper did not run');
      assert.equal(existsSync(fsmonitor), true, 'fixture fsmonitor helper did not run');
    } finally {
      git('config', '--unset', 'diff.marker.textconv');
      git('config', '--unset', 'core.fsmonitor');
      git('checkout', '--quiet', '--', 'app.txt');
      await rm(join(repository, '.gitattributes'));
    }
  });
});
