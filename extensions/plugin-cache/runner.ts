import {
  type OutdatedPackage,
  defaultPackagesDirectory,
  discardPackagesSync,
  findOutdatedPackages,
  npmSettings,
  registryPackument,
} from './refresh.ts';

export type Log = (level: 'info' | 'warn', message: string, extra: Record<string, unknown>) => Promise<void>;

export const LOG_SERVICE = 'plugin-cache-refresh';

// The TUI plugin and the server plugin can both run in one process. They load this module from the same file,
// but the key on globalThis keeps one check per process even if the module is evaluated more than once.
const STARTED = Symbol.for('plugin-cache-refresh.started');
type Started = typeof globalThis & { [STARTED]?: true };

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Checks the cache in the background, so registry requests do not delay startup. Outdated entries are removed when
// the process exits: the process has already loaded them, and a plugin can read more of its files later. Kilo
// also disposes and recreates instances while it runs, so instance disposal is not a safe point. The next start
// installs the current versions. The TUI and `kilo serve`, including the daemon, exit through `process.exit()` after
// SIGHUP, SIGINT, or SIGTERM. A process ended by a signal in another way keeps the entries; they are removed when a
// later process exits normally. Signal listeners are not added: libraries that re-raise signals only when they are
// the sole listener would stop doing so, and `kilo run` uses SIGINT without exiting.
export function startPluginCacheRefresh(log: Log, env: NodeJS.ProcessEnv = process.env): void {
  const started = globalThis as Started;
  if (started[STARTED] === true) {
    return;
  }
  started[STARTED] = true;
  void (async () => {
    const settings = npmSettings(env);
    // With `before` set, npm installs the newest version published before that date, not the current version.
    if (settings.pinnedDate) {
      return;
    }
    const packagesDirectory = defaultPackagesDirectory(env);
    const packages: readonly OutdatedPackage[] = await findOutdatedPackages({
      packagesDirectory,
      fetchPackument: registryPackument(settings),
      warn: (message, extra) => log('warn', message, extra),
    });
    if (packages.length === 0) {
      return;
    }
    process.once('exit', () => discardPackagesSync(packagesDirectory, packages));
    await log(
      'info',
      'Cached plugin packages have newer versions; they are removed when Kilo exits normally and reinstalled at the next start',
      {
        packages: packages.map(
          (entry) => `${entry.name}@${entry.spec}: ${entry.installedVersion} -> ${entry.availableVersion}`,
        ),
      },
    );
  })().catch((error: unknown) => log('warn', 'Plugin cache refresh failed', { error: errorText(error) }));
}
