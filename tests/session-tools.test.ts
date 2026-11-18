import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Agent, Config, Session } from '@kilocode/sdk/v2';
import type { TuiPluginApi } from '@kilocode/plugin/tui';
import { type Entry, clean, configFacts, contextRecords, lastAssistant } from '../extensions/session-tools/model.ts';
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
    temperature: 0,
    topP: 0.9,
    options: {
      reasoningEffort: 'high',
      store: false,
      futureParameter: { budget: 0, labels: ['one', 'two'], optional: null, apiKey: 'DO_NOT_DISPLAY' },
      empty: '',
      apiKey: 'DO_NOT_DISPLAY',
      sessionToken: 'DO_NOT_DISPLAY',
      headers: { 'X-Auth-Token': 'DO_NOT_DISPLAY', 'X-Amz-Security-Token': 'DO_NOT_DISPLAY' },
      budgetTokens: 16000,
    },
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
  assert.equal(value('Provider'), 'fixture');
  assert.equal(value('Model'), 'pinned');
  assert.equal(value('Configured temperature'), '0');
  assert.equal(value('Configured top_p'), '0.9');
  assert.equal(value('options.reasoningEffort'), '"high"');
  assert.equal(value('options.store'), 'false');
  assert.equal(value('options.empty'), '""');
  assert.deepEqual(JSON.parse(value('options.futureParameter')!), {
    budget: 0,
    labels: ['one', 'two'],
    optional: null,
    apiKey: '[redacted]',
  });
  assert.equal(value('options.apiKey'), '"[redacted]"');
  assert.equal(value('options.sessionToken'), '"[redacted]"');
  assert.deepEqual(JSON.parse(value('options.headers')!), {
    'X-Auth-Token': '[redacted]',
    'X-Amz-Security-Token': '[redacted]',
  });
  assert.equal(value('options.budgetTokens'), '16000');
  assert.equal(value('Workspace default (merged)'), 'fixture/project');
  assert.equal(value('Global file default'), 'fixture/global');
  assert.equal(value('Last recorded model for this agent'), 'fixture/observed');
  assert.equal(value('Configured group default'), undefined);
  assert.equal(value('Agent group'), undefined);
  assert.ok(!JSON.stringify(facts).includes('DO_NOT_DISPLAY'));

  assert.match(facts.find((item) => item.label === 'Origin file')!.value, /not exposed/);
  assert.equal(lastAssistant([entry(2), entry(1)])?.id, 'message-2');
});

test('metadata sanitizer strips terminal controls and enforces the length limit', () => {
  assert.equal(clean('before\x1b]52;c;SECRET\x07\x1b[31mafter\x00'), 'beforeafter');
  assert.equal(clean('hello\nworld', 7), 'hello\nw');
});

test('config and context register commands and open mocked menus with completed-request usage', async () => {
  const commands = new Map<string, () => Promise<void>>();
  const storedBookmarks = { version: 1, bookmarks: [{ id: 'saved', note: 'Retained note' }] };
  const saved = structuredClone(storedBookmarks);
  let shown: { title: string; options: { title: string; value: string; description?: string }[] } | undefined;
  const api = {
    kv: {
      ready: true,
      get: () => storedBookmarks,
      set: () => assert.fail('Inspection panels must not write stored data'),
    },
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
  assert.deepEqual([...commands.keys()].sort(), ['context-inspector.open', 'effective-config.open']);
  await commands.get('effective-config.open')!();
  assert.equal(shown?.title, 'Effective config: agent');
  assert.equal(shown.options[0]?.title, 'lead');
  await commands.get('context-inspector.open')!();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- The command can replace the captured dialog.
  assert.equal(shown?.title, 'Context inspector');
  assert.match(shown.options[0]?.description ?? '', /10 input/);
  assert.deepEqual(storedBookmarks, saved);
});
