import assert from 'node:assert/strict';
import { renameSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { TuiPluginModule } from '@opencode-ai/plugin/tui';

export default {
  id: 'kilo-panel-audit',
  tui: async (api) => {
    const opened: string[] = [];
    const waitFor = async (ready: () => boolean, message: string) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (ready()) {
          return;
        }
        await delay(100);
      }
      throw new Error(message);
    };
    const marker = process.env.PANEL_MARKER;
    assert.ok(marker !== undefined && marker !== '');
    try {
      await waitFor(() => api.state.ready, 'Kilo state did not become ready');
      const session = await api.client.session.create({ title: 'Local panel fixture' });
      assert.ok(session.data !== undefined, 'Kilo did not create the empty fixture session');
      api.route.navigate('session', { sessionID: session.data.id });
      await waitFor(
        () => api.route.current.name === 'session' && api.route.current.params?.sessionID === session.data.id,
        'Kilo did not navigate to the fixture session',
      );
      for (const id of ['effective-config', 'context-inspector', 'session-bookmarks', 'branches']) {
        api.ui.dialog.clear();
        await delay(100);
        assert.equal(api.ui.dialog.open, false, `Previous dialog remained open before ${id}`);
        api.keymap.dispatchCommand(`${id}.open`);
        await waitFor(() => api.ui.dialog.open, `Native ${id} panel did not open`);
        await delay(100);
        assert.equal(api.ui.dialog.open, true, `Native ${id} panel closed during rendering`);
        opened.push(id);
      }
      writeFileSync(`${marker}.tmp`, JSON.stringify({ plugins: api.plugins.list(), opened }));
      renameSync(`${marker}.tmp`, marker);
    } catch (error) {
      writeFileSync(
        `${marker}.tmp`,
        JSON.stringify({
          plugins: api.plugins.list(),
          opened,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      renameSync(`${marker}.tmp`, marker);
    }
  },
} satisfies TuiPluginModule;
