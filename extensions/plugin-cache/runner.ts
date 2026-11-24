import { setTimeout as delay } from 'node:timers/promises';
import {
  defaultPackagesDirectory,
  discardPackages,
  findOutdatedPackages,
  npmSettings,
  registryPackument,
} from './refresh.ts';

export type Log = (level: 'info' | 'warn', message: string, extra: Record<string, unknown>) => Promise<void>;
export type Notify = (message: string) => Promise<void>;

export const LOG_SERVICE = 'plugin-cache-refresh';

// Kilo starts the plugin once per project instance, and all instances in a process share this module.
// The key on globalThis keeps one check per process even if the module is evaluated more than once.
const STARTED = Symbol.for('plugin-cache-refresh.started');
type Started = typeof globalThis & { [STARTED]?: true };

// The TUI loads its own copies of npm plugins while the instance starts. Removing an entry during that load would
// make the TUI plugin fail for the session, so removal waits until startup is over.
export const REMOVAL_DELAY_MS = 3_000;

export interface RefreshOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly removalDelayMs?: number;
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Checks the cache in the background, so registry requests do not delay startup, and removes outdated entries
// shortly after startup. Plugins are imported when they load, so the running process keeps the old versions. A
// plugin that reads more of its own files later, such as lazily imported chunks or bundled assets, would fail after
// the removal. The next start installs the current versions. A reload reinstalls the files but keeps running the
// modules it already loaded, so only a restart loads the new versions.
export function startPluginCacheRefresh(log: Log, notify: Notify, options: RefreshOptions = {}): void {
  const env = options.env ?? process.env;
  const started = globalThis as Started;
  if (started[STARTED] === true) {
    return;
  }
  started[STARTED] = true;
  void (async () => {
    const settings = npmSettings();
    const packagesDirectory = defaultPackagesDirectory(env);
    const outdated = await findOutdatedPackages({
      packagesDirectory,
      fetchPackument: registryPackument(settings),
      warn: (message, extra) => log('warn', message, extra),
    });
    if (outdated.length === 0) {
      return;
    }
    // An unreferenced timer does not keep a finished process, such as `kilo run`, alive.
    await delay(options.removalDelayMs ?? REMOVAL_DELAY_MS, undefined, { ref: false });
    const discarded = new Set(discardPackages(packagesDirectory, outdated));
    const removed = outdated.filter((entry) => discarded.has(entry.entry));
    const kept = outdated.filter((entry) => !discarded.has(entry.entry));
    if (kept.length > 0) {
      await log('warn', 'Could not remove outdated cached plugin packages; the next start checks them again', {
        packages: kept.map((entry) => `${entry.name}@${entry.spec}`),
      });
    }
    if (removed.length === 0) {
      return;
    }
    const updates = removed.map(
      (entry) => `${entry.name}@${entry.spec}: ${entry.installedVersion} -> ${entry.availableVersion}`,
    );
    await log('info', 'Removed outdated cached plugin packages; the next start installs the new versions', {
      packages: updates,
    });
    await notify('Plugin updates are ready. Restart Kilo to load them.');
  })().catch((error: unknown) => log('warn', 'Plugin cache refresh failed', { error: errorText(error) }));
}
