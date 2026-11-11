import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);

export class BranchError extends Error {}

export interface Branch {
  name: string;
  ref: string;
  oid: string;
  remote: boolean;
  upstream: string;
  tracking: string;
  worktree: string;
}

export interface BranchSnapshot {
  fingerprint: string;
  current: string;
  dirty: boolean;
  conflicts: number;
  operation: boolean;
  branches: Branch[];
  remotes: string[];
}

export type BranchAction =
  | { kind: 'switch' | 'delete' | 'merge'; branch: string }
  | { kind: 'create'; name: string; start?: string }
  | { kind: 'rename'; branch: string; name: string }
  | { kind: 'fetch'; remote: string }
  | { kind: 'pull' };

export class BranchRepository {
  readonly directory: string;
  readonly signal: AbortSignal;
  private busy = false;

  constructor(directory: string, signal: AbortSignal) {
    this.directory = directory;
    this.signal = signal;
  }

  private async git(args: string[]): Promise<string> {
    try {
      const result = await executeFile('git', args, {
        cwd: this.directory,
        signal: this.signal,
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' },
      });
      return result.stdout;
    } catch {
      throw new BranchError(
        'Git refused or could not finish the action. Refresh and inspect Git status before retrying.',
      );
    }
  }

  async root(): Promise<string> {
    return realpath((await this.git(['rev-parse', '--show-toplevel'])).trim());
  }

  async snapshot(): Promise<BranchSnapshot> {
    const root = await this.root();
    if ((await realpath(root)) !== (await realpath(this.directory))) {
      throw new BranchError('Open the repository worktree root before using /branches.');
    }
    const [status, refs, worktrees, remotes] = await Promise.all([
      this.git(['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal']),
      this.git([
        'for-each-ref',
        '--format=%(refname)%00%(objectname)%00%(upstream:short)%00%(upstream:track)%00%(symref)%00',
        'refs/heads/',
        'refs/remotes/',
      ]),
      this.git(['worktree', 'list', '--porcelain', '-z']),
      this.git(['remote']),
    ]);
    const checkedOut = new Map<string, string>();
    let worktree = '';
    for (const field of worktrees.split('\0')) {
      if (field.startsWith('worktree ')) {
        worktree = field.slice(9);
      }
      if (field.startsWith('branch ')) {
        checkedOut.set(field.slice(7), worktree);
      }
    }
    const branches: Branch[] = [];
    for (const line of refs.trim().split('\n')) {
      const [ref, oid, upstream = '', tracking = '', symbolic = ''] = line.split('\0');
      if (ref === '' || symbolic !== '') {
        continue;
      }
      const remote = ref.startsWith('refs/remotes/');
      branches.push({
        ref,
        oid,
        name: ref.slice(remote ? 13 : 11),
        remote,
        upstream,
        tracking,
        worktree: checkedOut.get(ref) ?? '',
      });
    }
    const fields = status.split('\0');
    const current = fields.find((field) => field.startsWith('# branch.head '))?.slice(14) ?? '(unknown)';
    const markers = await Promise.all(
      ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG'].map(
        async (name) => {
          const path = (await this.git(['rev-parse', '--git-path', name])).trim();
          return access(resolve(this.directory, path)).then(
            () => name,
            () => '',
          );
        },
      ),
    );
    return {
      fingerprint: createHash('sha256')
        .update(status + refs + worktrees + remotes + markers.join('\0'))
        .digest('hex'),
      current,
      dirty: fields.some((field) => field.length > 0 && !field.startsWith('# ')),
      conflicts: fields.filter((field) => field.startsWith('u ')).length,
      operation: markers.some(Boolean),
      branches,
      remotes: remotes.trim().split('\n').filter(Boolean),
    };
  }

  async execute(
    action: BranchAction,
    expected: BranchSnapshot,
    authorized: () => boolean = () => true,
  ): Promise<BranchSnapshot> {
    if (this.busy) {
      throw new BranchError('A branch operation is already running.');
    }
    this.busy = true;
    try {
      const state = await this.snapshot();
      if (state.fingerprint !== expected.fingerprint) {
        throw new BranchError('Repository changed. Refresh and confirm again.');
      }
      if (state.operation) {
        throw new BranchError('Finish the current Git operation outside this panel first.');
      }
      if ('name' in action) {
        if (action.name === '' || action.name.startsWith('-')) {
          throw new BranchError('Invalid branch name.');
        }
        await this.git(['check-ref-format', `refs/heads/${action.name}`]);
      }
      const branch =
        'branch' in action
          ? state.branches.find((entry) =>
              action.kind === 'merge'
                ? entry.ref === action.branch || (!entry.remote && entry.name === action.branch)
                : entry.name === action.branch && !entry.remote,
            )
          : undefined;
      if ('branch' in action && branch === undefined) {
        throw new BranchError('Local branch no longer exists. Refresh first.');
      }
      if (branch !== undefined && branch.worktree !== '' && ['delete', 'rename', 'switch'].includes(action.kind)) {
        const currentWorktree = (await realpath(branch.worktree)) === (await realpath(this.directory));
        if (action.kind === 'delete') {
          throw new BranchError('Cannot delete a checked out branch.');
        }
        if (!currentWorktree) {
          throw new BranchError('Branch is checked out in another worktree.');
        }
      }
      if ((action.kind === 'merge' || action.kind === 'pull') && state.dirty) {
        throw new BranchError('A clean working tree is required.');
      }
      if (!authorized()) {
        throw new BranchError('Confirmation dismissed or project changed. No further Git changes were made.');
      }
      switch (action.kind) {
        case 'switch':
          await this.git(['switch', '--no-guess', '--no-overwrite-ignore', '--', action.branch]);
          break;
        case 'create': {
          const start =
            action.start === undefined ? undefined : state.branches.find((entry) => entry.ref === action.start);
          if (action.start !== undefined && start === undefined) {
            throw new BranchError('Starting branch no longer exists.');
          }
          await this.git([
            'switch',
            '--no-guess',
            '--no-overwrite-ignore',
            ...(start?.remote === true ? ['--track'] : []),
            '-c',
            action.name,
            ...(start !== undefined ? [start.ref] : []),
          ]);
          break;
        }
        case 'rename':
          await this.git(['branch', '-m', '--', action.branch, action.name]);
          break;
        case 'delete':
          await this.git(['branch', '-d', '--', action.branch]);
          break;
        case 'fetch':
          if (!state.remotes.includes(action.remote) || action.remote.startsWith('-')) {
            throw new BranchError('Select a configured remote.');
          }
          await this.git(['fetch', '--no-prune', '--', action.remote]);
          break;
        case 'pull':
          if ((state.branches.find((entry) => entry.name === state.current && !entry.remote)?.upstream ?? '') === '') {
            throw new BranchError('Current branch has no upstream.');
          }
          await this.git(['fetch', '--no-prune', '--no-recurse-submodules']);
          {
            const fetched = await this.snapshot();
            const original = state.branches.find((entry) => entry.name === state.current && !entry.remote);
            const current = fetched.branches.find((entry) => entry.name === fetched.current && !entry.remote);
            if (
              !authorized() ||
              fetched.current !== state.current ||
              fetched.dirty ||
              fetched.operation ||
              current?.upstream !== original?.upstream ||
              current?.oid !== original?.oid
            ) {
              throw new BranchError('Repository changed during fetch. Refresh before merging.');
            }
          }
          await this.git(['merge', '--ff-only', '--no-autostash', '--no-overwrite-ignore', '--', '@{upstream}']);
          break;
        case 'merge':
          await this.git(['merge', '--no-edit', '--no-autostash', '--no-overwrite-ignore', '--', branch?.ref ?? '']);
          break;
      }
      return await this.snapshot();
    } finally {
      this.busy = false;
    }
  }
}
