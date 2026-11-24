import type { TuiPluginModule } from '@kilocode/plugin/tui';
import { LOG_SERVICE, startPluginCacheRefresh } from './runner.ts';

// Whether the command line names `attach`, as in `kilo attach <url>`. Options with values, such as `--log-level`,
// can come first, so any argument counts. A false match, such as a project directory named `attach`, only skips the
// check.
export const isAttachCommand = (argv: readonly string[] = process.argv) => argv.slice(2).includes('attach');

// The TUI's main thread ends with `process.exit()`, also after SIGHUP, SIGINT, or SIGTERM, so its exit handler runs
// when the user quits or closes the terminal. `kilo attach`
// uses a server in another process, possibly on another machine, which can still have the cached packages loaded.
export default {
  id: 'plugin-cache-refresh',
  // eslint-disable-next-line @typescript-eslint/require-await -- Kilo requires a Promise-returning TUI registration hook.
  tui: async (api) => {
    if (isAttachCommand()) {
      return;
    }
    startPluginCacheRefresh((level, message, extra) =>
      api.client.app.log({ service: LOG_SERVICE, level, message, extra }).then(
        () => undefined,
        () => undefined,
      ),
    );
  },
} satisfies TuiPluginModule;
