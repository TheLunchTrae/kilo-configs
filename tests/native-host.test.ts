import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeBinary } from './native-host.ts';

test('direct native tests require runner selection and reject a matching unsupported executable', () => {
  assert.throws(() => nativeBinary({}), /Run native tests through/);
  assert.throws(
    () => nativeBinary({ KILO_BIN: process.execPath, KILO_NATIVE_VERSION: process.version }),
    /Native Kilo must satisfy/,
  );
  assert.throws(
    () => nativeBinary({ KILO_BIN: process.execPath, KILO_NATIVE_VERSION: '7.8.27' }),
    /Native executable changed/,
  );
});
