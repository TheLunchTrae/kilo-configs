import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { BranchRepository } from '../extensions/branches/git.ts';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'branches-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Branch Test');
  git('config', 'user.email', 'branches@example.invalid');
  git('commit', '--allow-empty', '-m', 'Initial');
  return { directory, git, repository: new BranchRepository(directory, new AbortController().signal) };
}

test('branch actions create, switch, rename and safely delete', async (t) => {
  const { repository, git } = await fixture(t);
  await repository.execute({ kind: 'create', name: 'feature' }, await repository.snapshot());
  assert.equal(git('branch', '--show-current'), 'feature');
  await repository.execute({ kind: 'rename', branch: 'feature', name: 'renamed' }, await repository.snapshot());
  assert.equal(git('branch', '--show-current'), 'renamed');
  await repository.execute({ kind: 'switch', branch: 'main' }, await repository.snapshot());
  await repository.execute({ kind: 'delete', branch: 'renamed' }, await repository.snapshot());
  assert.equal((await repository.snapshot()).branches.length, 1);
});

test('rejects stale confirmations, invalid names and current branch deletion', async (t) => {
  const { repository, git } = await fixture(t);
  const before = await repository.snapshot();
  git('branch', 'new');
  await assert.rejects(repository.execute({ kind: 'switch', branch: 'new' }, before), /changed/);
  await assert.rejects(repository.execute({ kind: 'create', name: '--force' }, await repository.snapshot()), /name/);
  await assert.rejects(
    repository.execute({ kind: 'delete', branch: 'main' }, await repository.snapshot()),
    /checked out/,
  );
});

test('never force deletes unmerged work or changes a dirty tree through merge', async (t) => {
  const { repository, git, directory } = await fixture(t);
  git('switch', '-c', 'feature');
  git('commit', '--allow-empty', '-m', 'Unmerged');
  git('switch', 'main');
  await assert.rejects(
    repository.execute({ kind: 'delete', branch: 'feature' }, await repository.snapshot()),
    /Git refused/,
  );
  assert.notEqual(git('rev-parse', 'feature'), '');
  await writeFile(join(directory, 'untracked'), 'keep');
  await assert.rejects(repository.execute({ kind: 'merge', branch: 'feature' }, await repository.snapshot()), /clean/);
  assert.equal((await repository.snapshot()).dirty, true);
});

test('lists remote tracking and refuses branches checked out in another worktree', async (t) => {
  const { repository, git, directory } = await fixture(t);
  const worktree = `${directory}-linked`;
  t.after(() => rm(worktree, { recursive: true, force: true }));
  git('worktree', 'add', '-b', 'linked', worktree);
  const state = await repository.snapshot();
  assert.notEqual(state.branches.find((branch) => branch.name === 'linked')?.worktree ?? '', '');
  await assert.rejects(repository.execute({ kind: 'switch', branch: 'linked' }, state), /worktree/);
  await assert.rejects(repository.execute({ kind: 'delete', branch: 'linked' }, state), /checked out/);
});

test('fetch and tracking checkout work against a local remote; pull refuses divergence', async (t) => {
  const { repository, git, directory } = await fixture(t);
  const remote = `${directory}-remote`;
  t.after(() => rm(remote, { recursive: true, force: true }));
  git('clone', '--bare', directory, remote);
  git('remote', 'add', 'origin', remote);
  await repository.execute({ kind: 'fetch', remote: 'origin' }, await repository.snapshot());
  await repository.execute(
    { kind: 'create', name: 'tracking', start: 'refs/remotes/origin/main' },
    await repository.snapshot(),
  );
  assert.equal(git('rev-parse', '--abbrev-ref', '@{upstream}'), 'origin/main');
  await repository.execute({ kind: 'pull' }, await repository.snapshot());
  git('commit', '--allow-empty', '-m', 'Local change');
  const upstreamCommit = git('commit-tree', 'HEAD^{tree}', '-p', 'HEAD~1', '-m', 'Remote change');
  git('push', 'origin', `${upstreamCommit}:refs/heads/main`);
  await assert.rejects(repository.execute({ kind: 'pull' }, await repository.snapshot()), /Git refused/);
  assert.equal(git('log', '-1', '--format=%s'), 'Local change');
});

test('merge preserves conflicts and blocks subsequent changes', async (t) => {
  const { repository, git, directory } = await fixture(t);
  await writeFile(join(directory, 'file'), 'base');
  git('add', 'file');
  git('commit', '-m', 'Base');
  git('switch', '-c', 'feature');
  await writeFile(join(directory, 'file'), 'feature');
  git('commit', '-am', 'Feature');
  git('switch', 'main');
  await writeFile(join(directory, 'file'), 'main');
  git('commit', '-am', 'Main');
  await assert.rejects(
    repository.execute({ kind: 'merge', branch: 'feature' }, await repository.snapshot()),
    /Git refused/,
  );
  assert.equal((await repository.snapshot()).operation, true);
  assert.equal((await repository.snapshot()).conflicts, 1);
  await assert.rejects(
    repository.execute({ kind: 'switch', branch: 'feature' }, await repository.snapshot()),
    /current Git operation/,
  );
});

test('switch, create and merge preserve ignored files that the target tracks', async (t) => {
  const { repository, git, directory } = await fixture(t);
  await writeFile(join(directory, '.gitignore'), 'private\n');
  git('add', '.gitignore');
  git('commit', '-m', 'Ignore');
  git('switch', '-c', 'feature');
  await writeFile(join(directory, 'private'), 'tracked');
  git('add', '-f', 'private');
  git('commit', '-m', 'Tracked');
  git('switch', 'main');
  await writeFile(join(directory, 'private'), 'keep');
  for (const action of [
    { kind: 'switch', branch: 'feature' },
    { kind: 'create', name: 'new', start: 'refs/heads/feature' },
    { kind: 'merge', branch: 'feature' },
  ] as const) {
    await assert.rejects(repository.execute(action, await repository.snapshot()), /Git refused/);
    assert.equal(await readFile(join(directory, 'private'), 'utf8'), 'keep');
  }
});

test('dirty switch preserves safe edits and refuses conflicting edits', async (t) => {
  const { repository, git, directory } = await fixture(t);
  await writeFile(join(directory, 'file'), 'base');
  git('add', 'file');
  git('commit', '-m', 'Base');
  git('branch', 'same');
  git('switch', '-c', 'different');
  await writeFile(join(directory, 'file'), 'other');
  git('commit', '-am', 'Other');
  git('switch', 'main');
  await writeFile(join(directory, 'file'), 'keep');
  await repository.execute({ kind: 'switch', branch: 'same' }, await repository.snapshot());
  await assert.rejects(
    repository.execute({ kind: 'switch', branch: 'different' }, await repository.snapshot()),
    /Git refused/,
  );
  assert.equal(await readFile(join(directory, 'file'), 'utf8'), 'keep');
});

test('creation does not expand previous-branch shorthand', async (t) => {
  const { repository, git } = await fixture(t);
  git('switch', '-c', 'previous');
  git('switch', 'main');
  await assert.rejects(
    repository.execute({ kind: 'create', name: '@{-1}' }, await repository.snapshot()),
    /Git refused/,
  );
});

test('handles unborn and detached HEAD without inventing upstreams', async (t) => {
  const { repository, git } = await fixture(t);
  await assert.rejects(repository.execute({ kind: 'pull' }, await repository.snapshot()), /no upstream/);
  git('switch', '--detach');
  assert.equal((await repository.snapshot()).current, '(detached)');
  await repository.execute({ kind: 'create', name: 'saved' }, await repository.snapshot());
  assert.equal(git('branch', '--show-current'), 'saved');
  git('switch', '--orphan', 'unborn');
  assert.equal((await repository.snapshot()).current, 'unborn');
  await repository.execute({ kind: 'create', name: 'first' }, await repository.snapshot());
  assert.equal(git('branch', '--show-current'), 'first');
});
