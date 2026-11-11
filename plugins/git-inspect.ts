import { type Plugin, tool } from '@opencode-ai/plugin';
import { spawn } from 'node:child_process';
import { isBlockedPath, secretExcludePathspecs } from '../extensions/security/secret-paths.ts';

const z = tool.schema;

const OPERATIONS = ['status', 'diff', 'changed-files', 'log', 'show', 'blame', 'merge-base'] as const;
type Operation = (typeof OPERATIONS)[number];

// Commits, refs, ranges, ancestry (~ ^), peeling such as ^{commit}, and reflog entries such as @{1} or @{upstream}.
// Search forms (:/text, ^{/regex}), index stages (:0:path), and options are not accepted.
const REVISION_PATTERN = /^(?!-)(?:[\w./~^-]|@(?:\{[\w.-]+\})?|\^\{[a-z]*\})+$/;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

// Settings that keep inspection independent of configured helper programs and avoid index writes.
const SAFE_CONFIG = [
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.pager=cat',
  '-c',
  'diff.external=',
  '-c',
  'log.showSignature=false',
  '-c',
  'color.ui=never',
];
const NO_HELPERS = ['--no-ext-diff', '--no-textconv'];

class GitInspectError extends Error {}

const fail = (message: string): never => {
  throw new GitInspectError(message);
};

const checkRevision = (value: string): string => {
  if (!REVISION_PATTERN.test(value)) {
    fail(
      `Unsupported revision "${value}". Use a commit, ref, range, ancestry, or reflog entry ` +
        'without options, searches, or whitespace.',
    );
  }
  return value;
};

const checkPath = (value: string): string => {
  if (value.length === 0 || value.includes('\0')) {
    fail('Paths must be nonempty.');
  }
  const blocked = isBlockedPath(value);
  if (blocked !== undefined) {
    fail(`Path "${value}" is sensitive (pattern ${blocked}).`);
  }
  return value;
};

// Literal magic disables globbing and pathspec magic in a supplied path.
const literal = (path: string): string => `:(literal)${path}`;

interface Run {
  args: string[];
  input?: string;
}
type Git = (run: Run) => Promise<string>;

interface Request {
  operation: Operation;
  revision?: string | undefined;
  paths?: string[] | undefined;
  staged?: boolean | undefined;
  stat?: boolean | undefined;
  patch?: boolean | undefined;
  maxCount?: number | undefined;
}

// Show one commit's header with a secret-filtered diff. diff-tree filters only the diff, and --always keeps
// the header when every change is excluded, so filtering never hides the commit itself.
const commitView = (stat: boolean, tail: string[]): string[] => [
  'diff-tree',
  ...NO_HELPERS,
  '--always',
  '--root',
  '--pretty=fuller',
  '--date=iso',
  // Merges show a first-parent diffstat, as `git show --stat` does; patches use the combined form.
  ...(stat ? ['--diff-merges=first-parent', '--stat'] : ['-p', '--cc']),
  ...tail,
];

const inspect = async (request: Request, git: Git): Promise<string> => {
  const revision = request.revision;
  const files = (request.paths ?? []).map(checkPath);
  const paths = files.map(literal);
  const content = ['--', ...paths, ...secretExcludePathspecs];
  const names = paths.length > 0 ? ['--', ...paths] : [];
  // show validates rev:path forms itself; every other operation takes a plain revision.
  const revisions = revision === undefined || request.operation === 'show' ? [] : [checkRevision(revision)];
  const stat = request.stat === true;
  switch (request.operation) {
    case 'status':
      return git({ args: ['status', '--short', '--branch', ...names] });
    case 'diff':
      return git({
        args: [
          'diff',
          ...NO_HELPERS,
          ...(request.staged === true ? ['--cached'] : []),
          ...(stat ? ['--stat'] : []),
          ...revisions,
          ...content,
        ],
      });
    case 'changed-files':
      return git({
        args: ['diff', '--name-status', ...(request.staged === true ? ['--cached'] : []), ...revisions, ...names],
      });
    case 'log': {
      const count = `--max-count=${String(request.maxCount ?? 20)}`;
      if (request.patch !== true && !stat) {
        return git({ args: ['log', count, '--date=iso', ...revisions, ...names] });
      }
      const commits = await git({
        args: ['rev-list', count, ...(revisions.length > 0 ? revisions : ['HEAD']), ...names],
      });
      return commits.trim() === ''
        ? ''
        : git({ args: commitView(stat && request.patch !== true, ['--stdin', ...content]), input: commits });
    }
    case 'show': {
      const target = revision ?? 'HEAD';
      const colon = target.indexOf(':');
      if (colon !== -1) {
        // Resolve a commit root so subtree IDs cannot hide sensitive parent directories.
        const root = checkRevision(target.slice(0, colon));
        const path = target.slice(colon + 1);
        if (path !== '') {
          checkPath(path);
        }
        const commit = (await git({ args: ['rev-parse', '--verify', `${root}^{commit}`] })).trim();
        return git({ args: ['show', ...NO_HELPERS, `${commit}:${path}`, ...content] });
      }
      checkRevision(target);
      if (target.includes('..')) {
        return fail('show takes one revision. Use log or diff for ranges.');
      }
      const type = (await git({ args: ['cat-file', '-t', target] })).trim();
      if (type === 'blob') {
        return fail('Show blobs as rev:path so the path can be checked.');
      }
      if (type === 'tree') {
        return git({ args: ['show', target, ...content] });
      }
      return git({ args: commitView(stat, [`${target}^{commit}`, ...content]) });
    }
    case 'blame':
      if (files.length !== 1) {
        return fail('blame requires exactly one path.');
      }
      return git({ args: ['blame', '--no-textconv', ...revisions, '--', ...files] });
    case 'merge-base': {
      const parts = revision?.split('...');
      if (parts?.length !== 2 || parts.some((part) => part.length === 0)) {
        return fail('merge-base requires a revision in the form A...B.');
      }
      return git({ args: ['merge-base', ...parts] });
    }
  }
};

const runGit =
  (cwd: string, signal: AbortSignal): Git =>
  ({ args, input }) =>
    new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        GIT_OPTIONAL_LOCKS: '0',
        GIT_TERMINAL_PROMPT: '0',
        GIT_NO_LAZY_FETCH: '1',
        GIT_PAGER: 'cat',
      };
      delete env.GIT_EXTERNAL_DIFF;
      const child = spawn('git', [...SAFE_CONFIG, '--no-pager', ...args], {
        cwd,
        env,
        signal,
        timeout: TIMEOUT_MS,
        windowsHide: true,
        stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
      const stdout: Buffer[] = [];
      let size = 0;
      let truncated = false;
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        if (truncated) {
          return;
        }
        if (size + chunk.length > MAX_OUTPUT_BYTES) {
          stdout.push(chunk.subarray(0, MAX_OUTPUT_BYTES - size));
          truncated = true;
          child.kill();
          return;
        }
        stdout.push(chunk);
        size += chunk.length;
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });
      child.on('error', (error) => {
        reject(new GitInspectError(`git ${args[0] ?? ''} failed: ${error.message}`));
      });
      child.on('close', (code) => {
        const text = Buffer.concat(stdout).toString();
        if (truncated) {
          resolve(`${text}\n[output truncated at ${String(MAX_OUTPUT_BYTES)} bytes; narrow the request]`);
        } else if (code === 0) {
          resolve(text);
        } else {
          const detail = stderr.trim() !== '' ? stderr.trim() : `exit code ${String(code)}`;
          reject(new GitInspectError(`git ${args[0] ?? ''} failed: ${detail}`));
        }
      });
      if (input !== undefined) {
        // diff-tree may exit early on bad input; its exit status reports that, so a broken pipe is ignored.
        child.stdin?.on('error', () => undefined);
        child.stdin?.end(input);
      }
    });

// eslint-disable-next-line @typescript-eslint/require-await -- OpenCode's plugin factory requires a Promise result.
export const GitInspectPlugin: Plugin = async () => ({
  tool: {
    git_inspect: tool({
      description:
        'Read-only Git inspection: status, diff, changed-files, log, show, blame, or merge-base. ' +
        'Use revision for a commit, ref, or range such as main...HEAD, and paths to limit output. ' +
        'Content of sensitive paths such as .env files and keys is excluded. No commands or options can be added.',
      args: {
        operation: z.enum(OPERATIONS).describe('Git operation to run.'),
        revision: z
          .string()
          .optional()
          .describe(
            'Commit, ref, or range. show takes one revision or rev:path and shows a tag as its commit. ' +
              'merge-base requires A...B.',
          ),
        paths: z.array(z.string()).max(50).optional().describe('Repository paths that limit the output.'),
        staged: z.boolean().optional().describe('diff or changed-files: compare the index instead of the worktree.'),
        stat: z.boolean().optional().describe('diff, log, or show: include a diffstat instead of patches.'),
        patch: z.boolean().optional().describe('log: include patches.'),
        maxCount: z.number().int().min(1).max(200).optional().describe('log: maximum commits, default 20.'),
      },
      async execute(args, context) {
        const output = await inspect(args, runGit(context.directory, context.abort));
        return output.length > 0 ? output : `git ${args.operation}: no output`;
      },
    }),
  },
});
