import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { TuiDialogSelectProps, TuiPluginApi } from '@opencode-ai/plugin/tui';
import branches from '../extensions/branches/index.ts';

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) {
      return;
    }
    await delay(10);
  }
  assert.fail('Panel did not reach the expected state');
}

async function harness(t: TestContext) {
  const previous = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'branch-ui-'));
  process.chdir(directory);
  t.after(async () => {
    process.chdir(previous);
    await rm(directory, { recursive: true, force: true });
  });
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  git('commit', '--allow-empty', '-m', 'Initial');
  git('branch', 'feature');
  const controller = new AbortController();
  let current: TuiDialogSelectProps<string> | undefined;
  let closed: (() => void) | undefined;
  let command: (() => void) | undefined;
  let gate: Promise<void> = Promise.resolve();
  let checks = 0;
  const messages: string[] = [];
  const client = {
    path: {
      get: () => Promise.resolve({ data: { directory }, request: new Request('http://opencode.internal/path') }),
    },
    session: {
      status: async () => {
        checks++;
        await gate;
        return { data: {} };
      },
    },
    permission: { list: () => Promise.resolve({ data: [] }) },
    question: { list: () => Promise.resolve({ data: [] }) },
  };
  const api = {
    lifecycle: { signal: controller.signal },
    state: { path: { directory } },
    route: { current: { name: 'home' } },
    client,
    keymap: {
      registerLayer: ({ commands }: { commands: { slashName: string; run: () => void }[] }) => {
        assert.equal(commands[0].slashName, 'branches');
        command = commands[0].run;
      },
    },
    ui: {
      DialogSelect: (props: TuiDialogSelectProps<string>) => {
        current = props;
      },
      toast: ({ message }: { message: string }) => {
        messages.push(message);
      },
      dialog: {
        get open() {
          return current !== undefined;
        },
        replace: (render: () => void, onClose?: () => void) => {
          closed?.();
          closed = onClose;
          render();
        },
        clear: () => {
          closed?.();
          closed = undefined;
          current = undefined;
        },
      },
    },
  } as unknown as TuiPluginApi;
  await branches.tui(api);
  command?.();
  await waitFor(() => current?.title.startsWith('Branches:') === true);
  const select = (value: string) => {
    assert.ok(current !== undefined);
    const option = current.options.find((item) => item.value === value);
    assert.ok(option !== undefined);
    current.onSelect?.(option);
  };
  const confirmation = async () => {
    select('refs/heads/feature');
    select('switch');
    await waitFor(() => current?.title.startsWith('Confirm:') === true);
  };
  return {
    api,
    git,
    messages,
    select,
    confirmation,
    controller,
    get current() {
      return current;
    },
    get checks() {
      return checks;
    },
    pause: () => {
      let release = () => {};
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

test('branch confirmation defaults to cancel and successful switching refreshes the panel', async (t) => {
  const view = await harness(t);
  await view.confirmation();
  assert.equal(view.current?.current, 'cancel');
  view.select('continue');
  view.select('continue');
  await waitFor(() => view.messages.some((message) => message.startsWith('Git operation completed')));
  assert.equal(view.git('branch', '--show-current'), 'feature');
  assert.match(view.current.title, /^Branches: feature/);
});

test('Escape cancels delayed confirmation execution even when its parent remains open', async (t) => {
  const view = await harness(t);
  await view.confirmation();
  const checks = view.checks;
  const release = view.pause();
  view.select('continue');
  await waitFor(() => view.checks > checks);
  view.api.ui.dialog.clear();
  await Promise.resolve();
  assert.equal(view.current?.title, 'feature');
  release();
  await delay(150);
  assert.equal(view.git('branch', '--show-current'), 'main');
  assert.equal(
    view.messages.some((message) => message.startsWith('Running')),
    false,
  );
});

test('dismissed menus do not reopen when activity inspection finishes', async (t) => {
  const view = await harness(t);
  const release = view.pause();
  view.select('refs/heads/feature');
  view.select('switch');
  await waitFor(() => view.checks > 0);
  view.api.ui.dialog.clear();
  await Promise.resolve();
  release();
  await delay(100);
  assert.match(view.current?.title ?? '', /^Branches:/);
  assert.equal(view.git('branch', '--show-current'), 'main');
});
