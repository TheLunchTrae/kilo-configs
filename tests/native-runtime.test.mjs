import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectVersion, verifyVersion } from './native-runtime.mjs';

test('native selection uses the newest stable compatible registry version', () => {
  const versions = ['1.18.34', '1.19.0', '1.19.3', '1.20.0', '1.19.4-beta.1', '2.0.0'];
  assert.equal(selectVersion(versions, '1.19.x', 'latest'), '1.19.3');
  assert.equal(selectVersion(versions, '1.19.x', 'minimum'), '1.19.0');
  assert.throws(() => selectVersion(['1.18.34'], '1.19.x', 'latest'), /No published/);
  assert.throws(() => selectVersion(versions, '1.19.x', 'cached'), /Unknown native/);
});

test('native verification rejects stale, incompatible, and malformed executable versions', () => {
  assert.doesNotThrow(() => verifyVersion('1.19.3\n', '1.19.3', '1.19.x'));
  for (const actual of ['1.18.34', '1.19.0', '1.20.0', 'unknown', '1.19.3-beta.1']) {
    assert.throws(() => verifyVersion(actual, '1.19.3', '1.19.x'), /Native OpenCode/);
  }
  assert.throws(() => verifyVersion('1.20.0', '1.20.0', '1.19.x'), /Native OpenCode/);
});
