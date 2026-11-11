import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeBinary } from './native-host.ts';

test('direct native tests require runner selection and reject a matching unsupported executable', () => {
  assert.throws(() => nativeBinary({}), /Run native tests through/);
  assert.throws(
    () => nativeBinary({ OPENCODE_BIN: process.execPath, OPENCODE_NATIVE_VERSION: process.version }),
    /Native OpenCode must satisfy/,
  );
  assert.throws(
    () => nativeBinary({ OPENCODE_BIN: process.execPath, OPENCODE_NATIVE_VERSION: '1.19.0' }),
    /Native executable changed/,
  );
});
