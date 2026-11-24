import type { PluginInput } from '@kilocode/plugin';
import { setTimeout as delay } from 'node:timers/promises';
import { isMainThread } from 'node:worker_threads';
import { PluginCacheRefreshPlugin } from '../plugins/plugin-cache-refresh.ts';

// Runs the server plugin as Kilo would for two project instances, then exits normally so the exit handler runs.
// With `worker`, it runs the plugin in a worker thread, as the TUI does, and exits once the worker has started it.
const POLL_INTERVAL_MS = 20;
const TIMEOUT_MS = 10_000;

if (isMainThread && process.argv[2] === 'worker') {
  const { Worker } = await import('node:worker_threads');
  const worker = new Worker(new URL(import.meta.url), { execArgv: ['--experimental-strip-types'] });
  await new Promise((resolve) => worker.once('message', resolve));
  await delay(500);
  await worker.terminate();
  process.stdout.write(JSON.stringify({ logs: [] }));
  process.exit(0);
}

const logs: unknown[] = [];
const client = {
  app: {
    log: (options: { body: unknown }) => {
      logs.push(options.body);
      return Promise.resolve({});
    },
  },
};
const input = { client } as unknown as PluginInput;
await PluginCacheRefreshPlugin(input);
await PluginCacheRefreshPlugin(input);
if (!isMainThread) {
  const { parentPort } = await import('node:worker_threads');
  parentPort?.postMessage('started');
} else {
  const deadline = Date.now() + TIMEOUT_MS;
  while (logs.length === 0 && Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
  }
  process.stdout.write(JSON.stringify({ logs }));
  process.exit(0);
}
