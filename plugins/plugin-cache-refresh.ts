import type { Plugin } from '@kilocode/plugin';
import { LOG_SERVICE, startPluginCacheRefresh } from '../extensions/plugin-cache/runner.ts';

// eslint-disable-next-line @typescript-eslint/require-await -- Kilo's plugin factory requires a Promise result.
export const PluginCacheRefreshPlugin: Plugin = async ({ client }) => {
  startPluginCacheRefresh(
    (level, message, extra) =>
      client.app.log({ body: { service: LOG_SERVICE, level, message, extra } }).then(
        () => undefined,
        () => undefined,
      ),
    // Without a TUI, as in `kilo serve`, the toast has nowhere to go; the log entry remains.
    (message) =>
      client.tui.showToast({ body: { title: 'Plugin updates', message, variant: 'info', duration: 30_000 } }).then(
        () => undefined,
        () => undefined,
      ),
  );
  return {};
};
