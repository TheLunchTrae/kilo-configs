import type { TuiPluginModule } from '@opencode-ai/plugin/tui';
import { type ContextRecord, clean, contextRecords, lastAssistant } from './model.ts';
import { currentSession, historyNote, snapshot, ui } from './client.ts';

export default {
  id: 'context-inspector',
  // eslint-disable-next-line @typescript-eslint/require-await -- OpenCode requires a Promise-returning TUI registration hook.
  tui: async (api) => {
    const view = ui(api);
    const open = async () => {
      const sessionID = currentSession(api);
      const client = api.client;
      const data = await snapshot(api, sessionID);
      if (api.lifecycle.signal.aborted || client !== api.client || currentSession(api) !== sessionID) {
        return;
      }
      const last = lastAssistant(
        data.entries.filter((entry) => {
          if (entry.info.role !== 'assistant' || entry.info.time.completed === undefined) {
            return false;
          }
          const failed = Boolean(entry.info.error);
          return !failed;
        }),
      );
      const records = contextRecords(data.entries);
      const show = (kind: ContextRecord['kind']) => {
        const items = records.filter((item) => item.kind === kind);
        view.menu(
          `${kind}: ${items.length} records`,
          items.length > 0
            ? items.map((item, index) => ({
                title: item.label,
                value: String(index),
                description: item.evidence,
                run: () =>
                  view.alert(
                    item.label,
                    `${item.evidence}\nMessage: ${item.messageID}\n` +
                      'This record does not establish inclusion in the current model request.',
                  ),
              }))
            : [{ title: 'No records in loaded history', value: 'empty' }],
        );
      };
      const token = (value: number | undefined) => (value === undefined ? 'Not reported' : value.toLocaleString());
      view.menu(
        'Context inspector',
        [
          {
            title: 'Latest completed request',
            value: 'usage',
            description:
              last !== undefined
                ? `${token(last.tokens.input)} input · ${token(last.tokens.output)} output`
                : 'No completed assistant request recorded',
            run: () =>
              view.alert(
                'Reported usage',
                last !== undefined
                  ? `${clean(last.providerID)}/${clean(last.modelID)}\nInput: ${token(last.tokens.input)}\n` +
                      `Output: ${token(last.tokens.output)}\nReasoning: ${token(last.tokens.reasoning)}\n` +
                      `Cache reads: ${token(last.tokens.cache.read)}\nCache writes: ${token(last.tokens.cache.write)}\n\n` +
                      'Fields follow provider accounting. They are not added together here.'
                  : 'No completed assistant request is recorded in the loaded history.',
              ),
          },
          { title: 'Files and attachments', value: 'files', run: () => show('file') },
          { title: 'Recorded skill loads', value: 'skills', run: () => show('skill') },
          { title: 'Compaction records', value: 'compaction', run: () => show('compaction') },
          {
            title: 'Limits of this view',
            value: 'limits',
            description: historyNote(data),
            run: () =>
              view.alert(
                'Context evidence',
                `${historyNote(data)}\n\n` +
                  'The exact assembled prompt and tokens per file are not exposed. Available skills are not assumed loaded. ' +
                  'Old file reads and attachments may no longer be in context after compaction. Tool outputs are not copied here.',
              ),
          },
          { title: 'Refresh', value: 'refresh', run: open },
        ],
        true,
      );
    };
    view.command('context-inspector.open', 'Inspect session context', 'inspect-context', 'Session', open);
  },
} satisfies TuiPluginModule;
