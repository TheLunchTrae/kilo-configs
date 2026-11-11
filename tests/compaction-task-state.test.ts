import type { PluginInput } from '@opencode-ai/plugin';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CompactionTaskStatePlugin } from '../plugins/compaction-task-state.ts';

describe('compaction-task-state plugin', () => {
  it('appends task-state guidance without replacing the native prompt', async () => {
    const hooks = await CompactionTaskStatePlugin({} as PluginInput);
    const hook = hooks['experimental.session.compacting'];
    assert.ok(hook !== undefined);
    for (const prompt of [undefined, 'existing prompt override']) {
      const originalContext = ['earlier plugin context'];
      const output: { context: string[]; prompt?: string } = { context: [...originalContext] };
      if (prompt !== undefined) {
        output.prompt = prompt;
      }
      await hook({ sessionID: 'session' }, output);
      assert.equal(output.prompt, prompt);
      assert.deepEqual(output.context.slice(0, originalContext.length), originalContext);
      assert.ok(output.context.slice(originalContext.length).some((context) => context.trim().length > 0));
    }
  });
});
