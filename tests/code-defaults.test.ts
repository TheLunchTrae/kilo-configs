import type { Config, PluginInput } from '@kilocode/plugin';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import codeDefaults from '../plugins/code-defaults.ts';

async function applyDefaults(config: unknown): Promise<void> {
  const hooks = await codeDefaults.server({} as PluginInput);
  assert.ok(hooks.config !== undefined);
  await hooks.config(config as Config);
}

describe('code-defaults plugin', () => {
  it('allows code edits without changing global defaults, other tools, or other agents', async () => {
    const config = {
      permission: { edit: 'ask', bash: 'ask' },
      agent: {
        code: { permission: { edit: 'ask', bash: 'ask' }, prompt: 'Synthetic code prompt' },
        reviewer: { permission: { edit: 'deny' } },
      },
    };
    const expected = structuredClone(config);
    expected.agent.code.permission.edit = 'allow';

    await applyDefaults(config);

    assert.deepEqual(config, expected);
  });

  it('preserves file-specific asks and denials in their original order', async () => {
    const edit = { '*': 'ask', 'reviewed/*': 'ask', 'protected/*': 'deny' };
    const config = { agent: { code: { permission: { edit } } } };

    await applyDefaults(config);
    await applyDefaults(config);

    assert.deepEqual(Object.entries(edit), [
      ['*', 'allow'],
      ['reviewed/*', 'ask'],
      ['protected/*', 'deny'],
    ]);
  });

  it('keeps explicit allow and deny defaults and rules without a fallback', async () => {
    for (const edit of [
      'allow',
      'deny',
      { '*': 'allow', 'protected/*': 'deny' },
      { '*': 'deny', 'reviewed/*': 'ask' },
      { 'reviewed/*': 'ask' },
    ]) {
      const config = { agent: { code: { permission: { edit } } } };
      const original = structuredClone(config);

      await applyDefaults(config);

      assert.deepEqual(config, original);
    }
  });

  it('leaves absent code permissions unchanged', async () => {
    for (const config of [{}, { agent: {} }, { agent: { code: {} } }, { agent: { code: { permission: {} } } }]) {
      const original = structuredClone(config);

      await applyDefaults(config);

      assert.deepEqual(config, original);
    }
  });
});
