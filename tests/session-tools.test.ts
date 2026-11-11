import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Agent, Config, Session } from '@opencode-ai/sdk/v2';
import type { TuiPluginApi } from '@opencode-ai/plugin/tui';
import {
  type Bookmark,
  type Entry,
  bookmarkKey,
  clean,
  configFacts,
  contextRecords,
  handoff,
  lastAssistant,
  readBookmarks,
} from '../extensions/session-tools/model.ts';
import { bookmarkStore } from '../extensions/session-tools/storage.ts';
import configPlugin from '../extensions/session-tools/config.ts';
import contextPlugin from '../extensions/session-tools/context.ts';
const session = (id = 'session-a', parentID?: string): Session => ({
  id,
  parentID,
  slug: id,
  projectID: 'project-a',
  directory: '/project',
  title: 'Add structured output',
  version: '1.18.34',
  time: { created: 1, updated: 2 },
});
const entry = (time: number, parts: unknown[] = [], info: Record<string, unknown> = {}): Entry =>
  ({
    info: {
      id: `message-${time}`,
      sessionID: 'session-a',
      role: 'assistant',
      agent: 'lead',
      parentID: 'user-1',
      mode: 'build',
      path: { cwd: '/project', root: '/project' },
      cost: 0,
      providerID: 'fixture',
      modelID: 'alpha',
      time: { created: time, completed: time + 1 },
      tokens: { input: 10, output: 2, reasoning: 0, cache: { read: 5, write: 0 } },
      ...info,
    },
    parts,
  }) as Entry;
const mark = (id = 'bookmark-a'): Bookmark => ({
  id,
  label: 'Output contract',
  note: 'JSON only on stdout.',
  kind: 'Decision',
  sessionID: 'session-a',
  messageID: 'message-1',
  created: 1,
  selected: true,
});

test('context records require actual attachments and completed tool evidence', () => {
  const records = contextRecords([
    entry(1, [
      { type: 'file', filename: 'input.ts', url: 'file:///input.ts' },
      {
        type: 'tool',
        tool: 'read',
        state: { status: 'completed', input: { filePath: 'read.ts' }, time: { compacted: 2 } },
      },
      { type: 'tool', tool: 'read', state: { status: 'error', input: { filePath: 'failed.ts' } } },
      { type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'checkpoint' }, time: {} } },
      { type: 'tool', tool: 'skill', state: { status: 'pending', input: { name: 'not-loaded' } } },
      { type: 'compaction', auto: true },
    ]),
    entry(
      3,
      [
        { type: 'text', text: 'Summary' },
        { type: 'text', text: 'More summary' },
      ],
      { summary: true },
    ),
  ]);
  assert.deepEqual(
    records.filter((item) => item.kind === 'file').map((item) => item.label),
    ['input.ts', 'read.ts'],
  );
  assert.deepEqual(
    records.filter((item) => item.kind === 'skill').map((item) => item.label),
    ['checkpoint'],
  );
  assert.equal(records.filter((item) => item.kind === 'compaction' && item.messageID === 'message-3').length, 1);
  assert.match(records.find((item) => item.label === 'Automatic compaction requested')!.evidence, /Request recorded/);
});

test('config inspection separates global, merged, agent, and observed settings without exposing secrets', () => {
  const agent = {
    name: 'reviewer',
    model: { providerID: 'fixture', modelID: 'pinned' },
    variant: 'high',
    options: { agent_group: 'reviewers', apiKey: 'DO_NOT_DISPLAY' },
  } as unknown as Agent;
  const config = {
    model: 'fixture/project',
    provider: { private: { options: { apiKey: 'DO_NOT_DISPLAY' } } },
    plugin: [['unrelated-plugin', { configFile: 'unread-private-settings.json', apiKey: 'DO_NOT_DISPLAY' }]],
  } as Config;
  const facts = configFacts(agent, config, { model: 'fixture/global' }, [
    entry(1, [], { agent: 'reviewer', modelID: 'older' }),
    entry(3, [], { agent: 'other', modelID: 'unrelated' }),
    entry(2, [], { agent: 'reviewer', modelID: 'observed' }),
  ]);
  const value = (label: string) => facts.find((item) => item.label === label)?.value;
  assert.equal(value('Agent default (server-resolved)'), 'fixture/pinned');
  assert.equal(value('Workspace default (merged)'), 'fixture/project');
  assert.equal(value('Global file default'), 'fixture/global');
  assert.equal(value('Last recorded model for this agent'), 'fixture/observed');
  assert.equal(value('Configured group default'), undefined);
  assert.equal(value('Agent group'), undefined);
  assert.ok(!JSON.stringify(facts).includes('DO_NOT_DISPLAY'));

  assert.match(facts.find((item) => item.label === 'Origin file')!.value, /not exposed/);
  assert.equal(lastAssistant([entry(2), entry(1)])?.id, 'message-2');
});

test('bookmarks persist by project, workspace, directory, and session without overwriting corrupt data', () => {
  const values = new Map<string, unknown>();
  const api = {
    kv: {
      ready: true,
      get: (key: string) => values.get(key),
      set: (key: string, value: unknown) => values.set(key, structuredClone(value)),
    },
  } as Pick<TuiPluginApi, 'kv'>;
  const legacyKey = 'session-tools.bookmarks.v1:["project-a","","/project","session-a"]';
  assert.equal(bookmarkKey(session()), legacyKey);
  values.set(legacyKey, { version: 1, bookmarks: [mark('legacy')] });
  const store = bookmarkStore(api, { session: session() });
  assert.equal(store.read()[0]?.id, 'legacy');
  values.clear();
  store.write((items) => [...items, mark()]);
  assert.equal(bookmarkStore(api, { session: session() }).read()[0]?.label, 'Output contract');
  assert.deepEqual(bookmarkStore(api, { session: session('other') }).read(), []);
  assert.deepEqual(bookmarkStore(api, { session: { ...session(), projectID: 'other' } }).read(), []);
  assert.deepEqual(bookmarkStore(api, { session: { ...session(), workspaceID: 'other' } }).read(), []);
  assert.deepEqual(bookmarkStore(api, { session: { ...session(), directory: '/other' } }).read(), []);
  const invalid = { version: 2, bookmarks: [] };
  values.set(bookmarkKey(session()), invalid);
  assert.throws(() => store.write(() => []), /preserved/);
  assert.equal(values.get(bookmarkKey(session())), invalid);
});

test('invalid and duplicate bookmarks are rejected rather than silently replaced', () => {
  assert.throws(() => readBookmarks({ version: 1, bookmarks: [mark(), mark()] }, 'session-a'), /invalid/);
  assert.throws(
    () => readBookmarks({ version: 1, bookmarks: [{ ...mark(), sessionID: 'other' }] }, 'session-a'),
    /invalid/,
  );
  assert.throws(() => readBookmarks({ version: 1, bookmarks: [{ ...mark(), created: NaN }] }, 'session-a'), /invalid/);
  assert.throws(() => readBookmarks({ version: 1, bookmarks: [{ ...mark(), label: ' ' }] }, 'session-a'), /invalid/);
});

test('handoff drafts preserve task context, selected notes, and source provenance', () => {
  const text = handoff(session(), [mark(), { ...mark('excluded'), note: 'EXCLUDED_NOTE', selected: false }]);
  assert.match(text, /Add structured output/);
  assert.match(text, /\/project/);
  assert.match(text, /Output contract/);
  assert.match(text, /JSON only on stdout/);
  assert.ok(!text.includes('EXCLUDED_NOTE'));
  assert.match(text, /Source session: session-a; message: message-1/);
  assert.doesNotThrow(() =>
    handoff(session(), [
      ...Array.from({ length: 20 }, (_, i) => mark(String(i))),
      { ...mark('excluded'), selected: false },
    ]),
  );
  assert.throws(
    () =>
      handoff(
        session(),
        Array.from({ length: 21 }, (_, i) => mark(String(i))),
      ),
    /at most 20/,
  );
});

test('metadata sanitizer strips terminal controls and enforces the length limit', () => {
  assert.equal(clean('before\x1b]52;c;SECRET\x07\x1b[31mafter\x00'), 'beforeafter');
  assert.equal(clean('hello\nworld', 7), 'hello\nw');
});

test('config and context register commands and open mocked menus with completed-request usage', async () => {
  const commands = new Map<string, () => Promise<void>>();
  let shown: { title: string; options: { title: string; value: string; description?: string }[] } | undefined;
  const api = {
    lifecycle: { signal: new AbortController().signal },
    route: { current: { name: 'session', params: { sessionID: 'session-a' } } },
    keymap: {
      registerLayer: ({ commands: items }: { commands: { name: string; run: () => Promise<void> }[] }) => {
        items.forEach((item) => commands.set(item.name, item.run));
        return () => {};
      },
    },
    ui: {
      dialog: { replace: (render: () => unknown) => render() },
      DialogSelect: (props: typeof shown) => {
        shown = props;
      },
      toast: () => assert.fail('Unexpected error toast'),
    },
    client: {
      app: { agents: async () => ({ data: [{ name: 'lead', mode: 'primary', options: {}, permission: [] }] }) },
      config: { get: async () => ({ data: { model: 'fixture/default' } }) },
      global: { config: { get: async () => ({ data: { model: 'fixture/global' } }) } },
      session: {
        get: async () => ({ data: session() }),
        messages: async () => ({
          data: [
            entry(1),
            entry(2, [], {
              time: { created: 2 },
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            }),
          ],
        }),
      },
    },
  } as unknown as TuiPluginApi;
  await configPlugin.tui(api);
  await contextPlugin.tui(api);
  await commands.get('effective-config.open')!();
  assert.equal(shown?.title, 'Effective config: agent');
  assert.equal(shown.options[0]?.title, 'lead');
  await commands.get('context-inspector.open')!();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- The command can replace the captured dialog.
  assert.equal(shown?.title, 'Context inspector');
  assert.match(shown.options[0]?.description ?? '', /10 input/);
});
