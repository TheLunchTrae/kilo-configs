import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectVersion, verifyVersion } from './native-runtime.mjs';

test('Kilo selection uses the newest stable compatible registry version or an exact pin', () => {
  const versions = ['7.7.34', '7.8.0', '7.8.27', '7.9.0', '7.8.28-beta.1', '8.0.0'];
  assert.equal(selectVersion(versions, '7.8.x'), '7.8.27');
  assert.equal(selectVersion(versions, '7.8.27'), '7.8.27');
  assert.throws(() => selectVersion(['7.7.34'], '7.8.x'), /No published Kilo/);
  assert.throws(() => selectVersion(['7.8.27', 7], '7.8.x'));
});

test('native verification rejects stale, incompatible, and malformed executable versions', () => {
  assert.doesNotThrow(() => verifyVersion('7.8.27\n', '7.8.27', '7.8.27'));
  for (const actual of ['7.7.34', '7.8.0', '7.9.0', 'unknown', '7.8.27-beta.1']) {
    assert.throws(() => verifyVersion(actual, '7.8.27', '7.8.27'), /Native Kilo/);
  }
  assert.throws(() => verifyVersion('7.9.0', '7.9.0', '7.8.x'), /Native Kilo/);
});
