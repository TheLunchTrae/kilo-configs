import type { TuiPluginModule } from '@kilocode/plugin/tui';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LOG_SERVICE, startPluginCacheRefresh } from './runner.ts';

// Whether the command line names `attach`, as in `kilo attach <url>`. Options with values, such as `--log-level`,
// can come first, so any argument counts. A false match, such as a project directory named `attach`, only skips the
// check.
export const isAttachCommand = (argv: readonly string[] = process.argv) => argv.slice(2).includes('attach');

const xdgDirectory = (value: string | undefined, fallback: string) =>
  (value === undefined || value === '' ? join(homedir(), fallback) : value).replace(/[\r\n]+/g, '');

// Kilo keeps state in `$XDG_STATE_HOME/kilo`. When XDG_STATE_HOME is unset, it can instead use an existing
// `<XDG data>/kilo/state`, so both places are checked.
export const daemonStateFiles = (env: NodeJS.ProcessEnv = process.env): string[] => {
  if (env.KILO_TEST_DAEMON_STATE_DIR !== undefined && env.KILO_TEST_DAEMON_STATE_DIR !== '') {
    return [join(env.KILO_TEST_DAEMON_STATE_DIR, 'daemon.json')];
  }
  const files = [join(xdgDirectory(env.XDG_STATE_HOME, '.local/state'), 'kilo', 'daemon.json')];
  if (env.XDG_STATE_HOME === undefined || env.XDG_STATE_HOME === '') {
    files.push(join(xdgDirectory(env.XDG_DATA_HOME, '.local/share'), 'kilo', 'state', 'daemon.json'));
  }
  return files;
};

const processAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
};

// Whether a Kilo daemon is running. A plain `kilo` TUI then attaches to the daemon's server instead of starting its
// own, as `DaemonClient.connect` decides, unless KILO_NO_DAEMON is set.
export const daemonRunning = (env: NodeJS.ProcessEnv = process.env): boolean => {
  if (env.KILO_NO_DAEMON !== undefined && env.KILO_NO_DAEMON !== '') {
    return false;
  }
  return daemonStateFiles(env).some((file) => {
    try {
      const state: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (typeof state !== 'object' || state === null || !('pid' in state) || typeof state.pid !== 'number') {
        return false;
      }
      return Number.isInteger(state.pid) && state.pid > 0 && processAlive(state.pid);
    } catch {
      return false;
    }
  });
};

// The embedded TUI ends its main thread with `process.exit()`, also after SIGHUP, SIGINT, or SIGTERM, so its exit
// handler runs when the user quits or closes the terminal. `kilo attach` and a TUI attached to the Kilo daemon use a
// server in another process, which can still have the cached packages loaded. The daemon is a `kilo serve`, so its own
// server entrypoint removes them when it shuts down.
export default {
  id: 'plugin-cache-refresh',
  // eslint-disable-next-line @typescript-eslint/require-await -- Kilo requires a Promise-returning TUI registration hook.
  tui: async (api) => {
    if (isAttachCommand() || daemonRunning()) {
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
