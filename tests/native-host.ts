import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { satisfies } = createRequire(import.meta.url)('semver') as {
  satisfies: (version: string, range: string) => boolean;
};
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  engines: { kilo: string };
};

export function nativeBinary(env: NodeJS.ProcessEnv = process.env): string {
  const binary = env.KILO_BIN;
  const version = env.KILO_NATIVE_VERSION;
  assert.ok(binary !== undefined && version !== undefined, 'Run native tests through npm run test:native');
  const result = spawnSync(binary, ['--version'], { env, encoding: 'utf8', timeout: 30_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), version, 'Native executable changed after selection');
  assert.ok(satisfies(version, manifest.engines.kilo), `Native Kilo must satisfy ${manifest.engines.kilo}`);
  return binary;
}
