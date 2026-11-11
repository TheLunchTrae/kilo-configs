import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TuiDialogSelectProps, TuiPluginApi, TuiPluginModule } from '@opencode-ai/plugin/tui';
import type { Session } from '@opencode-ai/sdk/v2';
import type { JSX } from '@opentui/solid';
import { bookmarkKey } from '../extensions/session-tools/model.ts';

test(
  'session panels preserve existing bookmarks and require explicit handoff copying without submission',
  {
    skip: process.versions.bun === undefined ? 'Run with Bun and @opentui/solid/preload to render TSX.' : false,
    timeout: 15_000,
  },
  async (t) => {
    const { RGBA } = await import('@opentui/core');
    const { testRender } = await import('@opentui/solid');
    const { jsx } = await import('@opentui/solid/jsx-runtime');
    const { createSignal } = await import('solid-js');
    const [frame, setFrame] = createSignal<(() => JSX.Element) | undefined>();
    let selected: TuiDialogSelectProps<string> | undefined;
    let closed: (() => void) | undefined;
    const commands = new Map<string, () => unknown>();
    const controller = new AbortController();
    const copied: string[] = [];
    const errors: unknown[] = [];
    let submissions = 0;
    const submit = () => {
      submissions++;
      return Promise.resolve({ data: undefined });
    };
    const session: Session = {
      id: 'root',
      slug: 'root',
      projectID: 'project',
      directory: '/project',
      title: 'Retained bookmark task',
      version: '1.19.3',
      time: { created: 1, updated: 2 },
    };
    const saved = {
      version: 1,
      bookmarks: [
        {
          id: 'saved',
          kind: 'Decision',
          label: 'Existing decision',
          note: 'PRESERVED_NOTE',
          created: 1,
          sessionID: 'root',
          messageID: 'message-1',
          selected: true,
        },
      ],
    };
    const storage = new Map<string, unknown>([[bookmarkKey(session), structuredClone(saved)]]);
    const api = {
      lifecycle: { signal: controller.signal },
      route: { current: { name: 'session', params: { sessionID: 'root' } } },
      client: {
        session: {
          get: async () => ({ data: session }),
          messages: async () => ({ data: [] }),
          prompt: submit,
          promptAsync: submit,
        },
      },
      kv: {
        ready: true,
        get: (key: string) => storage.get(key),
        set: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
      },
      renderer: {
        copyToClipboardOSC52: (text: string) => {
          copied.push(text);
          return true;
        },
      },
      theme: {
        current: {
          primary: RGBA.fromHex('#F78AEE'),
          text: RGBA.fromHex('#ffffff'),
          textMuted: RGBA.fromHex('#aaaaaa'),
          backgroundPanel: RGBA.fromHex('#222222'),
        },
      },
      keymap: {
        registerLayer: ({ commands: layer }: { commands: { name: string; run: () => unknown }[] }) => {
          layer.forEach((command) => commands.set(command.name, command.run));
          return () => layer.forEach((command) => commands.delete(command.name));
        },
      },
      ui: {
        toast: (notification: { variant: string }) => {
          if (notification.variant === 'error') {
            errors.push(notification);
          }
        },
        DialogSelect: (props: TuiDialogSelectProps<string>) => {
          selected = props;
          return jsx('text', {
            get children() {
              return `${props.title}\n${props.options.map((option) => option.title).join('\n')}`;
            },
          });
        },
        dialog: {
          get open() {
            return frame() !== undefined;
          },
          replace: (render: () => JSX.Element, onClose?: () => void) => {
            closed?.();
            closed = onClose;
            setFrame(() => render);
          },
          clear: () => {
            closed?.();
            closed = undefined;
            setFrame(undefined);
          },
          setSize: () => {},
        },
      },
    } as unknown as TuiPluginApi;
    const renderer = await testRender(
      () =>
        jsx('box', {
          width: '100%',
          get children() {
            return frame()?.();
          },
        }),
      { width: 88, height: 40 },
    );
    t.after(() => {
      controller.abort();
      renderer.renderer.destroy();
    });
    for (const name of ['config', 'context', 'bookmarks']) {
      const spec = new URL(
        `../extensions/session-tools/${name}.${name === 'bookmarks' ? 'tsx' : 'ts'}`,
        import.meta.url,
      ).href;
      const plugin = ((await import(spec)) as { default: TuiPluginModule }).default;
      await plugin.tui(api, undefined, {
        id: plugin.id ?? name,
        source: 'file',
        spec,
        target: spec,
        first_time: 1,
        last_time: 1,
        time_changed: 1,
        load_count: 1,
        fingerprint: 'fixture',
        state: 'first',
      });
    }
    assert.deepEqual(
      [...commands.keys()].sort(),
      [
        'effective-config.open',
        'context-inspector.open',
        'session-bookmarks.open',
        'session-bookmarks.add',
        'session-bookmarks.handoff',
      ].sort(),
    );
    const select = async (value: string) => {
      const option = selected?.options.find((item) => item.value === value);
      assert.ok(option !== undefined, `Missing menu option: ${value}`);
      selected?.onSelect?.(option);
      await renderer.flush();
    };
    await commands.get('session-bookmarks.open')!();
    await renderer.flush();
    assert.match(renderer.captureCharFrame(), /Existing decision/);
    assert.deepEqual(storage.get(bookmarkKey(session)), saved);
    await select('saved');
    await select('select');
    await renderer.waitForFrame((value) => value.includes('0 selected'));
    await select('saved');
    await select('select');
    await renderer.waitForFrame((value) => value.includes('1 selected'));
    assert.deepEqual(storage.get(bookmarkKey(session)), saved);
    await select('draft');
    await renderer.waitForFrame((value) => value.includes('Handoff draft'));
    assert.equal(copied.length, 0, 'Opening a handoff must not copy it');
    assert.equal(submissions, 0, 'Opening a handoff must not submit it');
    assert.deepEqual(errors, []);
    await commands.get('session-bookmarks.copy-draft')!();
    assert.equal(copied.length, 1);
    assert.match(copied[0], /^\/checkpoint /);
    assert.match(copied[0], /PRESERVED_NOTE/);
    assert.match(copied[0], /Source session: root; message: message-1/);
    assert.equal(submissions, 0, 'Copying a handoff must not submit it');
    assert.deepEqual(errors, []);
    renderer.resize(60, 25);
    await renderer.flush();
    assert.match(renderer.captureCharFrame(), /Handoff draft/);
    api.ui.dialog.clear();
    await renderer.waitForFrame((value) => value.includes('Bookmarks:'));
    assert.equal(commands.has('session-bookmarks.copy-draft'), false);
    assert.deepEqual(storage.get(bookmarkKey(session)), saved);
  },
);
