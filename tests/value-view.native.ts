import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TuiPluginApi } from '@kilocode/plugin/tui';
import { valueViewer } from '../extensions/tui/value-view.ts';

for (const host of ['kilo-config']) {
  test(
    `${host} parameter values scroll, resize and clean up with the native renderer`,
    { skip: process.versions.bun === undefined ? 'Run with Bun to exercise the native renderer.' : false },
    async (t) => {
      const runtime = await import('@opentui/core');
      const { createTestRenderer } = await import('@opentui/core/testing');
      const rendered = await createTestRenderer({ width: 88, height: 30 });
      const { renderer } = rendered;
      const controller = new AbortController();
      const layers = new Set<{ bindings?: { key: string; cmd: () => void }[] }>();
      const api = {
        renderer,
        theme: {
          current: {
            text: runtime.RGBA.fromHex('#e5e7eb'),
            textMuted: runtime.RGBA.fromHex('#94a3b8'),
          },
        },
        lifecycle: { signal: controller.signal },
        keymap: {
          registerLayer: (layer: { bindings?: { key: string; cmd: () => void }[] }) => {
            layers.add(layer);
            return () => layers.delete(layer);
          },
        },
      } as unknown as TuiPluginApi;
      const initialResizeListeners = renderer.listenerCount('resize');
      const message = JSON.stringify(
        {
          enabled: false,
          budgetTokens: 0,
          records: Array.from({ length: 80 }, (_, index) => `row-${index}`),
          last: 'END_OF_PARAMETER',
        },
        null,
        2,
      );
      const view = (await valueViewer(api))('options.arbitrary', message);
      assert.ok(view instanceof runtime.BoxRenderable);
      renderer.root.add(view);
      t.after(() => {
        controller.abort();
        renderer.destroy();
      });
      await rendered.flush();
      assert.match(rendered.captureCharFrame(), /row-0/);
      assert.doesNotMatch(rendered.captureCharFrame(), /END_OF_PARAMETER/);
      const output = process.env.MODEL_VIEW_ARTIFACT_DIR;
      const capture = async (name: string) => {
        if (output !== undefined) {
          await mkdir(output, { recursive: true });
          const frame = rendered.captureSpans();
          await writeFile(
            join(output, `${host}-${name}.json`),
            JSON.stringify({
              cols: frame.cols,
              rows: frame.rows,
              lines: frame.lines.map((line) =>
                line.spans.map((span) => ({
                  text: span.text,
                  width: span.width,
                  fg: span.fg.toInts(),
                  bg: span.bg.toInts(),
                })),
              ),
            }),
          );
        }
      };
      await capture('value-top');
      const end = [...layers][0]?.bindings?.find((binding) => binding.key === 'end');
      assert.ok(end !== undefined);
      end.cmd();
      await rendered.flush();
      assert.match(rendered.captureCharFrame(), /END_OF_PARAMETER/);
      await capture('value-end');
      rendered.resize(52, 18);
      await rendered.flush();
      end.cmd();
      await rendered.flush();
      assert.match(rendered.captureCharFrame(), /END_OF_PARAMETER/);
      view.destroyRecursively();
      assert.equal(layers.size, 0);
      assert.equal(renderer.listenerCount('resize'), initialResizeListeners);
      const next = (await valueViewer(api))('Next value', message);
      assert.ok(next instanceof runtime.BoxRenderable);
      renderer.root.add(next);
      controller.abort();
      assert.equal(next.isDestroyed, true);
      assert.equal(layers.size, 0);
      assert.equal(renderer.listenerCount('resize'), initialResizeListeners);
      const stale = await valueViewer(api);
      assert.throws(() => stale('Closed', message), /closed/);
    },
  );
}
