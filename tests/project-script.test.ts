import type { PluginInput } from '@opencode-ai/plugin';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { ProjectScriptPlugin } from '../plugins/project-script.ts';

interface AskInput {
  permission: string;
  patterns: string[];
  always: string[];
  metadata: Record<string, unknown>;
}

let project = '';

const execute = async (
  args: Record<string, unknown>,
  options: { deny?: boolean; directory?: string; worktree?: string; asks?: AskInput[]; signal?: AbortSignal } = {},
) => {
  const hooks = await ProjectScriptPlugin({} as PluginInput);
  const definition = hooks.tool?.project_script;
  assert.ok(definition !== undefined);
  const asks = options.asks ?? [];
  const result = await definition.execute(args, {
    sessionID: 'session',
    messageID: 'message',
    agent: 'builder',
    directory: options.directory ?? project,
    worktree: options.worktree ?? project,
    abort: options.signal ?? new AbortController().signal,
    metadata: () => undefined,
    ask: async (input: AskInput) => {
      asks.push(input);
      if (options.deny === true) {
        throw new Error('denied');
      }
    },
  });
  const output = typeof result === 'string' ? result : result.output;
  return { output, asks };
};

describe('project_script tool', () => {
  before(async () => {
    project = await mkdtemp(join(tmpdir(), 'project-script-'));
    await writeFile(join(project, 'print.mjs'), "console.log('args:' + JSON.stringify(process.argv.slice(2)));\n");
    await writeFile(
      join(project, 'package.json'),
      JSON.stringify({
        scripts: {
          show: 'node print.mjs',
          broken: 'node -e "process.exit(3)"',
          mark: "node -e \"require('fs').writeFileSync('marked','')\"",
          stdin: "node -e \"process.stdin.on('data',()=>{}).on('end',()=>console.log('stdin-closed'))\"",
          hang: 'node hang.mjs',
        },
      }),
    );
    await writeFile(
      join(project, 'hang.mjs'),
      "import { spawn } from 'node:child_process';\nimport { writeFileSync } from 'node:fs';\n" +
        "const child = spawn('sleep', ['30'], { stdio: 'ignore' });\n" +
        "writeFileSync('hang.pid', String(child.pid));\nsetInterval(() => {}, 1000);\n",
    );
    await writeFile(join(project, 'Makefile'), 'VAR := value\n.PHONY: hello\nhello:\n\t@echo make-ran\n');
    await mkdir(join(project, 'packages', 'pnpm-app'), { recursive: true });
    await writeFile(join(project, 'packages', 'pnpm-app', 'package.json'), JSON.stringify({ scripts: { test: 'x' } }));
    await writeFile(join(project, 'packages', 'pnpm-app', 'pnpm-lock.yaml'), '');
  });

  after(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('lists declared scripts and Makefile targets', async () => {
    const { output, asks } = await execute({});
    assert.deepEqual(output.split('\n').sort(), [
      'make:hello',
      'npm:broken',
      'npm:hang',
      'npm:mark',
      'npm:show',
      'npm:stdin',
    ]);
    assert.equal(asks.length, 0);
  });

  it('asks with an exact key and passes arguments without a shell', async () => {
    const marker = join(project, 'pwned');
    const { output, asks } = await execute({ script: 'show', args: ['--grep', '$(touch pwned)', 'a b'] });
    assert.match(output, /args:\["--grep","\$\(touch pwned\)","a b"\]/);
    assert.match(output, /\[exit code 0\]/);
    assert.equal(existsSync(marker), false);
    assert.equal(asks.length, 1);
    const [ask] = asks as [AskInput];
    assert.equal(ask.permission, 'project_script');
    assert.match(ask.patterns[0] ?? '', /^npm:show in \. #[0-9a-f]{12} \["--grep","\$\(touch pwned\)","a b"\]$/);
    assert.deepEqual(ask.always, ask.patterns);
    assert.equal(ask.metadata.script, 'node print.mjs');
    assert.equal(ask.metadata.command, 'npm run show -- --grep $(touch pwned) a b');
  });

  it('changes the approval key when scripts or the directory change, and escapes wildcards', async () => {
    const key = async (args: Record<string, unknown>) => {
      const asks: AskInput[] = [];
      await execute(args, { deny: true, asks }).catch(() => undefined);
      return asks[0]?.patterns[0] ?? '';
    };
    const before = await key({ script: 'show' });
    const path = join(project, 'package.json');
    const original = await readFile(path, 'utf8');
    const edited: unknown = JSON.parse(original);
    assert.ok(typeof edited === 'object' && edited !== null);
    Reflect.set(Reflect.get(edited, 'scripts') as object, 'show', 'node print.mjs --other');
    await writeFile(path, JSON.stringify(edited));
    try {
      assert.notEqual(await key({ script: 'show' }), before);
    } finally {
      await writeFile(path, original);
    }
    assert.equal(await key({ script: 'show' }), before);
    const wild = await key({ script: 'show', args: ['*', 'a?'] });
    assert.equal(/[*?]/.test(wild), false, wild);
    assert.notEqual(await key({ script: 'show', args: ['a b'] }), await key({ script: 'show', args: ['a', 'b'] }));
    assert.match(await key({ script: 'test', directory: 'packages/pnpm-app' }), / in packages\/pnpm-app #/);
  });

  it('does not run when permission is denied', async () => {
    await assert.rejects(execute({ script: 'mark' }, { deny: true }), /denied/);
    assert.equal(existsSync(join(project, 'marked')), false);
  });

  it('closes stdin', async () => {
    const { output } = await execute({ script: 'stdin' });
    assert.match(output, /stdin-closed/);
  });

  // The check reads /proc, so it only proves anything on Linux.
  it('stops the whole process tree when aborted', { skip: process.platform !== 'linux' }, async () => {
    const controller = new AbortController();
    const pidFile = join(project, 'hang.pid');
    const pending = execute({ script: 'hang' }, { signal: controller.signal });
    for (let attempt = 0; attempt < 100 && !existsSync(pidFile); attempt++) {
      await setTimeout(50);
    }
    const pid = Number(await readFile(pidFile, 'utf8'));
    controller.abort();
    const { output } = await pending;
    assert.match(output, /\[stopped: aborted\]/);
    // An exited process can linger as a zombie until the container's init reaps it; that is not running.
    const running = () => {
      try {
        return !/^State:\s+Z/m.test(readFileSync(`/proc/${String(pid)}/status`, 'utf8'));
      } catch {
        return false;
      }
    };
    for (let attempt = 0; attempt < 40 && running(); attempt++) {
      await setTimeout(50);
    }
    assert.equal(running(), false, 'grandchild process still running');
  });

  it('reports a failing script without throwing', async () => {
    const { output } = await execute({ script: 'broken' });
    assert.match(output, /\[exit code 3\]/);
  });

  it('runs Makefile targets and rejects their arguments', async () => {
    const { output } = await execute({ script: 'hello', runner: 'make' });
    assert.match(output, /make-ran/);
    await assert.rejects(execute({ script: 'hello', args: ['-f', 'other'] }), /do not accept/);
  });

  it('rejects undeclared scripts and directories outside the worktree', async () => {
    await assert.rejects(execute({ script: 'rm -rf .' }), /not a declared script/);
    await assert.rejects(execute({ script: 'VAR' }), /not a declared script/);
    await assert.rejects(execute({ directory: '..' }), /inside the project worktree/);
  });

  it('detects the package manager from the lockfile', async () => {
    const asks: AskInput[] = [];
    await assert.rejects(execute({ script: 'test', directory: 'packages/pnpm-app' }, { deny: true, asks }), /denied/);
    assert.match(asks[0]?.patterns[0] ?? '', /^pnpm:test in packages\/pnpm-app #[0-9a-f]{12}$/);
    assert.equal(asks[0]?.metadata.command, 'pnpm run test');
  });

  it('inherits the nearest package manager without crossing the worktree', async () => {
    const workspace = join(project, 'workspace');
    const nested = join(workspace, 'packages', 'app');
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, 'package.json'), JSON.stringify({ scripts: { test: 'example' } }));
    const listing = async (worktree = workspace) => (await execute({}, { directory: nested, worktree })).output;

    await writeFile(join(workspace, 'package.json'), JSON.stringify({ packageManager: 'yarn@4.9.0' }));
    assert.equal(await listing(), 'yarn:test');
    const asks: AskInput[] = [];
    await assert.rejects(
      execute({ script: 'test', runner: 'yarn' }, { directory: nested, worktree: workspace, deny: true, asks }),
      /denied/,
    );
    assert.match(asks[0]?.patterns[0] ?? '', /^yarn:test in packages\/app #/);

    await rm(join(workspace, 'package.json'));
    await writeFile(join(workspace, 'pnpm-lock.yaml'), '');
    assert.equal(await listing(), 'pnpm:test');
    await writeFile(join(nested, 'package-lock.json'), '{}');
    assert.equal(await listing(), 'npm:test');
    await writeFile(
      join(nested, 'package.json'),
      JSON.stringify({ packageManager: 'bun@1.3.0', scripts: { test: 'example' } }),
    );
    assert.equal(await listing(), 'bun:test');
    await writeFile(join(nested, 'package.json'), JSON.stringify({ scripts: { test: 'example' } }));
    await rm(join(nested, 'package-lock.json'));
    assert.equal(await listing(nested), 'npm:test');
  });

  it('does not retain discarded output buffers after truncation', async (context) => {
    const directory = join(project, 'verbose');
    await mkdir(directory);
    await writeFile(join(directory, 'package.json'), JSON.stringify({ scripts: { verbose: 'node verbose.mjs' } }));
    await writeFile(
      join(directory, 'verbose.mjs'),
      "import { writeSync } from 'node:fs';\n" +
        "const chunk = Buffer.alloc(65536, 'x');\n" +
        'for (let index = 0; index < 384; index++) writeSync(1, chunk);\n',
    );
    const concat = Buffer.concat.bind(Buffer);
    let retainedBytes = 0;
    context.mock.method(Buffer, 'concat', (chunks: readonly Uint8Array[], length?: number) => {
      const buffers = new Set(chunks.map((chunk) => chunk.buffer));
      retainedBytes = Math.max(
        retainedBytes,
        [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0),
      );
      return concat(chunks, length);
    });
    const { output } = await execute({ script: 'verbose', directory: 'verbose' });
    assert.match(output, /\[output truncated\]/);
    assert.match(output, /\[exit code 0\]/);
    assert.ok(retainedBytes >= 20 * 1024 * 1024, 'the output collector was not observed');
    assert.ok(retainedBytes <= 21 * 1024 * 1024, `retained ${String(retainedBytes)} bytes after truncation`);
  });
});
