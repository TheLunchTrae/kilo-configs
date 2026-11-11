import { type Plugin, tool } from '@opencode-ai/plugin';
import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const z = tool.schema;

type Runner = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'composer' | 'make';
interface Script {
  runner: Runner;
  name: string;
  // Text whose change must invalidate a saved approval: the whole scripts map or Makefile.
  source: string;
  // Declared command text shown in the approval prompt.
  body: string;
}

const TIMEOUT_MS = 10 * 60_000;
const KILL_GRACE_MS = 3000;
// After a stop, a descendant that left the process group can still hold the output pipes open.
const ABANDON_MS = KILL_GRACE_MS + 2000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const SCRIPT_NAME = /^[\w:.@/-]+$/;
// Windows runs .cmd and .bat shims through cmd.exe, so arguments there are limited to characters it treats literally.
const WINDOWS_SAFE_ARGUMENT = /^[\w@+=:,./-]+$/;
const MAKE_TARGET = /^([a-z0-9][\w.-]*)\s*:(?![:=])/i;

class ProjectScriptError extends Error {}

const fail = (message: string): never => {
  throw new ProjectScriptError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJson = async (path: string): Promise<Record<string, unknown> | undefined> => {
  if (!existsSync(path)) {
    return undefined;
  }
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  return isRecord(value) ? value : undefined;
};

const packageRunner = async (
  directory: string,
  manifest: Record<string, unknown>,
  worktree: string,
): Promise<Runner> => {
  let current = directory;
  let currentManifest: Record<string, unknown> | undefined = manifest;
  for (;;) {
    const declared =
      typeof currentManifest?.packageManager === 'string' ? currentManifest.packageManager.split('@')[0] : undefined;
    if (declared === 'pnpm' || declared === 'yarn' || declared === 'bun' || declared === 'npm') {
      return declared;
    }
    if (existsSync(join(current, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (existsSync(join(current, 'yarn.lock'))) {
      return 'yarn';
    }
    if (existsSync(join(current, 'bun.lock')) || existsSync(join(current, 'bun.lockb'))) {
      return 'bun';
    }
    if (
      existsSync(join(current, 'package-lock.json')) ||
      existsSync(join(current, 'npm-shrinkwrap.json')) ||
      current === worktree
    ) {
      return 'npm';
    }
    current = dirname(current);
    currentManifest = await readJson(join(current, 'package.json'));
  }
};

const manifestScripts = (
  runner: Runner,
  manifest: Record<string, unknown> | undefined,
  lifecycle: boolean,
): Script[] => {
  const scripts = manifest?.scripts;
  if (!isRecord(scripts)) {
    return [];
  }
  const source = JSON.stringify(scripts);
  const describe = (name: string) =>
    typeof scripts[name] === 'string' ? scripts[name] : JSON.stringify(scripts[name]);
  return Object.keys(scripts).map((name) => {
    const present = (lifecycle ? [`pre${name}`, name, `post${name}`] : [name]).filter((hook) => hook in scripts);
    const body = present.map((hook) => (present.length > 1 ? `${hook}: ${describe(hook)}` : describe(hook))).join('\n');
    return { runner, name, source, body };
  });
};

const makeTargets = (text: string): Script[] => {
  const lines = text.split(/\r?\n/);
  const targets = new Map<string, string[]>();
  lines.forEach((line, index) => {
    const name = MAKE_TARGET.exec(line)?.[1];
    if (name === undefined) {
      return;
    }
    // A target can appear in several rules; all of them are shown because make may combine or override them.
    const recipe = [...(targets.get(name) ?? []), line];
    for (const next of lines.slice(index + 1)) {
      if (!next.startsWith('\t')) {
        break;
      }
      recipe.push(next);
    }
    targets.set(name, recipe);
  });
  return [...targets].map(([name, recipe]) => ({ runner: 'make', name, source: text, body: recipe.join('\n') }));
};

const discover = async (directory: string, worktree: string): Promise<Script[]> => {
  const scripts: Script[] = [];
  const manifest = await readJson(join(directory, 'package.json'));
  if (manifest !== undefined) {
    const runner = await packageRunner(directory, manifest, worktree);
    // npm, Yarn 1, and Bun run pre<name> and post<name>; pnpm does not by default.
    scripts.push(...manifestScripts(runner, manifest, runner !== 'pnpm'));
  }
  scripts.push(...manifestScripts('composer', await readJson(join(directory, 'composer.json')), false));
  for (const file of ['GNUmakefile', 'makefile', 'Makefile']) {
    const path = join(directory, file);
    if (existsSync(path)) {
      scripts.push(...makeTargets(await readFile(path, 'utf8')));
      break;
    }
  }
  return scripts.filter((script) => SCRIPT_NAME.test(script.name));
};

const commandLine = (script: Script, args: readonly string[]): [string, string[]] => {
  switch (script.runner) {
    case 'npm':
      return ['npm', ['run', script.name, ...(args.length > 0 ? ['--', ...args] : [])]];
    case 'pnpm':
    case 'yarn':
    case 'bun':
      return [script.runner, ['run', script.name, ...args]];
    case 'composer':
      return ['composer', ['run-script', script.name, ...(args.length > 0 ? ['--', ...args] : [])]];
    case 'make':
      return ['make', [script.name]];
  }
};

// The host treats * and ? in permission patterns as wildcards, so the key escapes them to stay exact.
const escapeWildcards = (value: string): string => value.replaceAll('*', '\\u002a').replaceAll('?', '\\u003f');

const approvalKey = (script: Script, directory: string, args: readonly string[]): string => {
  const hash = createHash('sha256').update(script.source).digest('hex').slice(0, 12);
  const key = `${script.runner}:${script.name} in ${directory} #${hash}${args.length > 0 ? ` ${JSON.stringify(args)}` : ''}`;
  return escapeWildcards(key);
};

const resolveDirectory = async (
  worktree: string,
  base: string,
  requested: string | undefined,
): Promise<{ path: string; label: string; worktree: string }> => {
  const target = requested === undefined ? base : resolve(base, requested);
  const [root, actual] = await Promise.all([
    realpath(worktree),
    realpath(target).catch(() => fail('Directory not found.')),
  ]);
  const path = relative(root, actual);
  if (path.startsWith('..') || isAbsolute(path)) {
    fail('The directory must be inside the project worktree.');
  }
  return { path: actual, label: path === '' ? '.' : path.replaceAll('\\', '/'), worktree: root };
};

const killTree = (child: ChildProcess): void => {
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {
      child.kill();
    });
    return;
  }
  // POSIX children run in their own process group, so the negative PID reaches the script's descendants too.
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-pid, name);
    } catch {
      // the group already exited
    }
  };
  signal('SIGTERM');
  setTimeout(() => {
    signal('SIGKILL');
  }, KILL_GRACE_MS).unref();
};

const run = (
  command: string,
  args: string[],
  cwd: string,
  abort: AbortSignal,
): Promise<{ status: string; output: string }> =>
  new Promise((resolvePromise) => {
    const windows = process.platform === 'win32';
    const child = spawn(command, args, {
      cwd,
      shell: windows,
      detached: !windows,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let stopped: string | undefined;
    let finished = false;
    // Assigned once finish exists; called if the streams never close after a stop.
    let abandon = (): void => undefined;
    const stop = (reason: string) => {
      if (stopped === undefined) {
        stopped = reason;
        killTree(child);
        setTimeout(() => {
          abandon();
        }, ABANDON_MS).unref();
      }
    };
    const timer = setTimeout(() => {
      stop(`timed out after ${String(TIMEOUT_MS / 60_000)} minutes`);
    }, TIMEOUT_MS);
    const onAbort = () => {
      stop('aborted');
    };
    abort.addEventListener('abort', onAbort, { once: true });
    if (abort.aborted) {
      onAbort();
    }
    const collect = (chunk: Buffer) => {
      if (size === MAX_OUTPUT_BYTES) {
        truncated = true;
        return;
      }
      if (size + chunk.length > MAX_OUTPUT_BYTES) {
        chunks.push(chunk.subarray(0, Math.max(0, MAX_OUTPUT_BYTES - size)));
        size = MAX_OUTPUT_BYTES;
        truncated = true;
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const finish = (status: string) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      abort.removeEventListener('abort', onAbort);
      const text = Buffer.concat(chunks).toString();
      resolvePromise({ status, output: truncated ? `${text}\n[output truncated]` : text });
    };
    abandon = () => {
      child.stdout.destroy();
      child.stderr.destroy();
      finish(`stopped: ${stopped ?? 'unknown'}; some output streams stayed open`);
    };
    child.on('error', (error) => {
      finish(`failed to start: ${error.message}`);
    });
    child.on('close', (code, signal) => {
      if (stopped !== undefined) {
        finish(`stopped: ${stopped}`);
      } else if (code !== null) {
        finish(`exit code ${String(code)}`);
      } else {
        finish(`terminated by ${signal ?? 'unknown signal'}`);
      }
    });
  });

// eslint-disable-next-line @typescript-eslint/require-await -- OpenCode's plugin factory requires a Promise result.
export const ProjectScriptPlugin: Plugin = async () => ({
  tool: {
    project_script: tool({
      description:
        'Run a script the project declares: a package.json script (with its package manager), a composer.json ' +
        'script, or a Makefile target. Each run asks for project_script permission. Omit script to list scripts. ' +
        'Arguments pass to the script without a shell. Use bash only for commands that are not declared scripts.',
      args: {
        script: z.string().optional().describe('Declared script or target name. Omit to list available scripts.'),
        runner: z
          .enum(['npm', 'pnpm', 'yarn', 'bun', 'composer', 'make'])
          .optional()
          .describe('Choose the source when the same name is declared more than once.'),
        args: z.array(z.string()).max(20).optional().describe('Extra script arguments. Not supported for make.'),
        directory: z.string().optional().describe('Project-relative directory containing the manifest.'),
      },
      async execute(input, context) {
        const directory = await resolveDirectory(context.worktree, context.directory, input.directory);
        const scripts = await discover(directory.path, directory.worktree);
        if (input.script === undefined) {
          return scripts.length > 0
            ? scripts.map((script) => `${script.runner}:${script.name}`).join('\n')
            : 'No declared scripts found.';
        }
        const matches = scripts.filter(
          (script) => script.name === input.script && (input.runner === undefined || script.runner === input.runner),
        );
        if (matches.length !== 1) {
          return fail(
            matches.length === 0
              ? `"${input.script}" is not a declared script in ${directory.label}.`
              : `"${input.script}" is declared by ${matches.map((script) => script.runner).join(' and ')}; set runner.`,
          );
        }
        const [script] = matches;
        const extra = input.args ?? [];
        if (script.runner === 'make' && extra.length > 0) {
          fail('Makefile targets do not accept extra arguments.');
        }
        if (extra.some((arg) => arg.includes('\0'))) {
          fail('Arguments cannot contain NUL characters.');
        }
        if (process.platform === 'win32' && extra.some((arg) => !WINDOWS_SAFE_ARGUMENT.test(arg))) {
          fail('On Windows, arguments are limited to letters, digits, and @+=:,./_- characters.');
        }
        const [command, args] = commandLine(script, extra);
        const display = [command, ...args].join(' ');
        const key = approvalKey(script, directory.label, extra);
        // A saved approval covers this script, directory, declared scripts, and argument list exactly.
        await context.ask({
          permission: 'project_script',
          patterns: [key],
          always: [key],
          metadata: { command: display, directory: directory.label, script: script.body },
        });
        context.metadata({ title: display });
        const result = await run(command, args, directory.path, context.abort);
        return {
          title: display,
          output: `$ ${display}\n${result.output}\n[${result.status}]`,
          metadata: { status: result.status },
        };
      },
    }),
  },
});
