import type { Plugin } from '@kilocode/plugin';
import { isMainThread } from 'node:worker_threads';
import { LOG_SERVICE, startPluginCacheRefresh } from '../extensions/plugin-cache/runner.ts';

// Covers processes without the TUI, such as `kilo run`. The TUI runs server plugins in a
// worker thread that it terminates without exit handlers, so there the TUI entrypoint in
// `extensions/plugin-cache/tui.ts` does the work from the main thread.
// eslint-disable-next-line @typescript-eslint/require-await -- Kilo's plugin factory requires a Promise result.
export const PluginCacheRefreshPlugin: Plugin = async ({ client }) => {
  if (isMainThread) {
    startPluginCacheRefresh((level, message, extra) =>
      client.app.log({ body: { service: LOG_SERVICE, level, message, extra } }).then(
        () => undefined,
        () => undefined,
      ),
    );
  }
  return {};
};
