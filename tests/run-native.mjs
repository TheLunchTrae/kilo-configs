import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withNativeRuntime } from './native-runtime.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const files = (await readdir(new URL('./', import.meta.url)))
  .filter((file) => file.endsWith('.native.ts'))
  .map((file) => `tests/${file}`);
await withNativeRuntime(process.argv[2] ?? 'latest', (env) => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files], {
    cwd: repository,
    env,
    stdio: 'inherit',
    timeout: 300_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'Native suite failed');
});
