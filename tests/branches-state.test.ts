import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TuiPluginApi } from '@opencode-ai/plugin/tui';
import { activity, embeddedRequest, localDirectory } from '../extensions/branches/state.ts';

function apiFixture() {
  const directory = process.cwd();
  const controller = new AbortController();
  const statuses: Record<string, { type: string }> = {};
  const permissions: { sessionID: string }[] = [];
  const questions: { sessionID: string }[] = [];
  const directories: Record<string, string> = {};
  const connection = { offline: false };
  const pathResponse = { data: { directory }, request: new Request('http://opencode.internal/path') };
  const api = {
    lifecycle: { signal: controller.signal },
    state: { path: { directory } },
    client: {
      path: { get: () => Promise.resolve(pathResponse) },
      session: {
        status: () => (connection.offline ? Promise.reject(new Error('offline')) : Promise.resolve({ data: statuses })),
        get: ({ sessionID }: { sessionID: string }) =>
          Promise.resolve({ data: { directory: directories[sessionID] ?? directory } }),
      },
      permission: { list: () => Promise.resolve({ data: permissions }) },
      question: { list: () => Promise.resolve({ data: questions }) },
    },
  } as unknown as TuiPluginApi;
  return { api, statuses, permissions, questions, directories, pathResponse, controller, connection };
}

test('only accepts embedded local requests without workspace routing', () => {
  assert.equal(embeddedRequest(new Request('http://opencode.internal/path')), true);
  assert.equal(embeddedRequest(new Request('http://localhost:4096/path')), false);
  assert.equal(embeddedRequest(new Request('http://opencode.internal/path?workspace=remote')), false);
  assert.equal(
    embeddedRequest(new Request('http://opencode.internal/path', { headers: { 'x-opencode-workspace': 'remote' } })),
    false,
  );
});

test('local guard rejects remote servers even when their directory matches', async () => {
  const { api, pathResponse } = apiFixture();
  assert.equal(await localDirectory(api), await realpath(process.cwd()));
  pathResponse.request = new Request('https://remote.example/path');
  await assert.rejects(localDirectory(api), /local embedded/);
});

test('activity includes children, retrying agents and pending requests, excluding other directories', async () => {
  const { api, statuses, permissions, questions, directories } = apiFixture();
  statuses.child = { type: 'busy' };
  directories.child = join(process.cwd(), 'extensions');
  statuses.retry = { type: 'retry' };
  statuses.idle = { type: 'idle' };
  statuses.other = { type: 'busy' };
  directories.other = '/tmp';
  permissions.push({ sessionID: 'permission' });
  questions.push({ sessionID: 'question' });
  assert.match(await activity(api, await realpath(process.cwd())), /^4 active/);
});

test('activity failures explicitly report uncertainty instead of idle', async () => {
  const { api, connection } = apiFixture();
  connection.offline = true;
  assert.match(await activity(api, process.cwd()), /unavailable/);
});
