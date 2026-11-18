import { type PluginInput, type ToolContext, tool } from '@kilocode/plugin';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { TempFilesPlugin } from '../plugins/temp-files.ts';

const context = (sessionID: string) => ({ sessionID }) as ToolContext;

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'temp-files-test-'));
  const previous = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP };
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
    await rm(root, { recursive: true, force: true });
  });
  process.env.TMPDIR = root;
  process.env.TMP = root;
  process.env.TEMP = root;
  const tools = (await TempFilesPlugin({} as PluginInput)).tool;
  assert.ok(tools !== undefined);
  return { root, read: tools.temp_read, write: tools.temp_write };
}

test('temporary files use the configured temp directory and support UTF-8, overwrite, and empty content', async (t) => {
  const { root, read, write } = await fixture(t);
  const filename = 'my notes — café.txt';
  const session = context('session-a');
  await write.execute({ filename, content: 'Hello, 世界!\nAnother line.' }, session);
  assert.equal(await read.execute({ filename }, session), 'Hello, 世界!\nAnother line.');
  const files = (await readdir(root, { recursive: true })).filter((path) => path.endsWith(filename));
  assert.equal(files.length, 1);
  assert.equal(await readFile(join(root, files[0]), 'utf8'), 'Hello, 世界!\nAnother line.');
  for (const content of ['short', '']) {
    await write.execute({ filename, content }, session);
    assert.equal(await read.execute({ filename }, session), content);
  }
});

test('sessions keep separate files during concurrent first writes', async (t) => {
  const { read, write } = await fixture(t);
  const filename = 'notes.txt';
  await Promise.all([
    write.execute({ filename, content: 'first' }, context('session-a')),
    write.execute({ filename, content: 'second' }, context('session-b')),
    write.execute({ filename: 'other.txt', content: 'parallel' }, context('session-a')),
  ]);
  assert.equal(await read.execute({ filename }, context('session-a')), 'first');
  assert.equal(await read.execute({ filename }, context('session-b')), 'second');
  assert.equal(await read.execute({ filename: 'other.txt' }, context('session-a')), 'parallel');
  await assert.rejects(read.execute({ filename: 'other.txt' }, context('session-b')));
});

test('both tools reject paths, traversal, empty names, and reserved Windows names', async (t) => {
  const { read, write } = await fixture(t);
  const readArgs = tool.schema.object(read.args);
  const writeArgs = tool.schema.object(write.args);
  for (const filename of [
    '',
    '.',
    '..',
    '../outside.txt',
    '..\\outside.txt',
    'folder/file.txt',
    'folder\\file.txt',
    '/absolute.txt',
    'C:\\absolute.txt',
    'C:relative.txt',
    '\\\\server\\file.txt',
    'file\0.txt',
    '.. ',
    'notes.',
    'file:stream',
    'NUL',
    'CON.txt',
    'COM1',
    'LPT¹.log',
  ]) {
    assert.equal(readArgs.safeParse({ filename }).success, false, filename);
    assert.equal(writeArgs.safeParse({ filename, content: 'blocked' }).success, false, filename);
    await assert.rejects(read.execute({ filename }, context('session-a')));
    await assert.rejects(write.execute({ filename, content: 'blocked' }, context('session-a')));
  }
  assert.equal(readArgs.safeParse({ filename: 42 }).success, false);
  assert.equal(writeArgs.safeParse({ filename: 'notes.txt', content: null }).success, false);
});

test('missing files return a safe error and session identifiers cannot become paths', async (t) => {
  const { root, read, write } = await fixture(t);
  const session = context('../../other-session');
  await assert.rejects(read.execute({ filename: 'missing.txt' }, session), {
    message: 'Could not read the temporary file.',
  });
  await write.execute({ filename: '.notes.txt', content: 'private' }, session);
  assert.ok((await readdir(root, { recursive: true })).some((path) => path.endsWith('.notes.txt')));
  assert.equal(await read.execute({ filename: '.notes.txt' }, session), 'private');
  await assert.rejects(read.execute({ filename: '.notes.txt' }, context('other-session')));
});
