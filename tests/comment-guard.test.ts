import type { PluginInput } from '@opencode-ai/plugin';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { CommentGuardPlugin } from '../plugins/comment-guard.ts';

const createHook = async (directory = '/project') => {
  const hooks = await CommentGuardPlugin({ directory } as unknown as PluginInput);
  const hook = hooks['tool.execute.before'];
  assert.ok(hook !== undefined);
  return hook;
};

const run = async (tool: string, args: Record<string, unknown>, directory?: string) => {
  const hook = await createHook(directory);
  await hook({ tool, sessionID: 'test-session', callID: 'test-call' }, { args });
};

const assertBlocked = async (tool: string, args: Record<string, unknown>, expected: string) => {
  await assert.rejects(run(tool, args), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /blocked by comment-guard plugin/);
    assert.ok(error.message.includes(expected), error.message);
    return true;
  });
};

const edit = (newString: string, filePath = '/project/src/app.ts', oldString = '') => ({
  filePath,
  oldString,
  newString,
});

const patch = (...body: string[]) => ({ patchText: ['*** Begin Patch', ...body, '*** End Patch'].join('\n') });

let savedMode: string | undefined;

beforeEach(() => {
  savedMode = process.env.OPENCODE_COMMENT_GUARD;
  delete process.env.OPENCODE_COMMENT_GUARD;
});

afterEach(() => {
  if (savedMode === undefined) {
    delete process.env.OPENCODE_COMMENT_GUARD;
  } else {
    process.env.OPENCODE_COMMENT_GUARD = savedMode;
  }
});

describe('comment-guard plugin', () => {
  it('blocks added comments that reference the conversation or earlier iterations', async () => {
    for (const comment of [
      '// As requested, retry twice before failing.',
      '// Per our discussion, cache the token.',
      '/* You asked for a shorter timeout. */',
      ' * Previously this was a class; now a function.',
      '// Changed from forEach to a for loop.',
      '// Now uses Map instead of a plain object.',
      '// Kept the guard from our previous iteration.',
      '// Per the prompt, keep both indexes.',
      '{/* As the user requested, hide the banner. */}',
      'const limit = 3; // per the user request',
      'const label = "it\'s"; // as requested',
      "fn first<'a>(value: &'a str) -> &'a str { value } // you said to borrow",
    ]) {
      await assertBlocked('edit', edit(comment), 'src/app.ts');
    }
    await assertBlocked('edit', edit('# As we discussed, skip vendored files.', '/project/tool.py'), 'tool.py');
    await assertBlocked('edit', edit('retries = 3  # as requested', '/project/tool.py'), 'tool.py');
    await assertBlocked('edit', edit('-- Per the prompt, keep both indexes.', '/project/schema.sql'), 'schema.sql');
    await assertBlocked('edit', edit('# As requested, ignore dist', '/project/.gitignore'), '.gitignore');
    await assertBlocked('edit', edit('# you asked me to pin this', '/project/.env.local'), '.env.local');
    await assertBlocked('edit', edit('# Per our discussion, use fpm.', '/project/index.php'), 'index.php');
    await assertBlocked('edit', edit('--[[\nAs requested, keep both.\n]]', '/project/init.lua'), 'keep both');
  });

  it('checks block comment bodies and Python docstrings', async () => {
    await assertBlocked('edit', edit('/*\n  As requested, retry twice.\n*/\nretry();'), 'As requested, retry twice.');
    await assertBlocked(
      'edit',
      edit('<!--\nPer our discussion, keep the banner.\n-->', '/project/page.html'),
      'banner',
    );
    await assertBlocked(
      'edit',
      edit('def retry():\n    """As requested, retry twice."""\n    pass', '/project/tool.py'),
      'As requested, retry twice.',
    );
    await assertBlocked(
      'edit',
      edit('def retry():\n    """\n    Per our discussion, retry twice.\n    """', '/project/tool.py'),
      'Per our discussion',
    );
  });

  it('treats multi-line strings as strings, not comments', async () => {
    const python = 'SQL = """\nSELECT 1\n"""\n\ndef f():\n    return "as requested"\n';
    await run('edit', edit(python, '/project/query.py'));
    await assertBlocked(
      'edit',
      edit(`${python}\ndef g():\n    """As requested, retry twice."""\n`, '/project/query.py'),
      'As requested, retry twice.',
    );
    await run('edit', edit('const prompt = `\n* You asked for a summary.\n`;\nrun(prompt);'));
    await assertBlocked('edit', edit('const prompt = `\nSummary\n`; // you said to inline it'), 'inline it');
    await run('edit', edit('<p>a // as requested</p>', '/project/index.html'));
    await assertBlocked('edit', edit('const re = /`/g;\n// As requested, escape backticks.'), 'escape backticks');
    await run('edit', edit('const re = /[([/`+-]/u;\nconst t = `\n// As requested\n`;'));
    await assertBlocked('edit', edit('SELECT 1 -- as requested', '/project/query.sql'), 'query.sql');
    await assertBlocked('edit', edit('SELECT 1 --1 as requested', '/project/query.sql'), 'query.sql');
    await assertBlocked(
      'edit',
      edit('---@param x number As requested, take a number', '/project/init.lua'),
      'init.lua',
    );
    await assertBlocked(
      'edit',
      edit('{cond && <a href="/x">y</a>} {/* as requested */}', '/project/src/a.tsx'),
      'a.tsx',
    );
    await assertBlocked(
      'edit',
      edit('return <a href={url}>link</a>; // as requested', '/project/src/link.tsx'),
      'link.tsx',
    );
    await assertBlocked('edit', edit('  / denominator; // as requested'), 'src/app.ts');
    await assertBlocked('edit', edit('x = i++ / 2; // as requested'), 'src/app.ts');
    await assertBlocked(
      'edit',
      edit('background: url(/logo.png); /* as requested */', '/project/site.css'),
      'site.css',
    );
    await assertBlocked('edit', edit('-- | Changed from foldr to foldl.', '/project/Main.hs'), 'Main.hs');
    await assertBlocked('edit', edit('{-| You asked for a lazy fold. -}', '/project/Main.hs'), 'Main.hs');
    await assertBlocked('edit', edit('x = 1 -- ^ Per the prompt, keep it.', '/project/Main.hs'), 'Main.hs');
    await assertBlocked('edit', edit('local x = 1 -- as requested', '/project/init.lua'), 'init.lua');
    await assertBlocked('edit', edit('{- Per our discussion, keep it lazy. -}', '/project/Main.hs'), 'Main.hs');

    process.env.OPENCODE_COMMENT_GUARD = 'all';
    await run('edit', edit('SQL = """\nSELECT 1\n"""\nx = 1\ny = 2\n', '/project/query.py'));
  });

  it('allows neutral comments, code, strings, and prose files', async () => {
    for (const line of [
      '// Retry twice because the upstream API drops the first request after a deploy.',
      '// Fires when the state changed from idle to busy.',
      '// The user requested a password reset; send the email once.',
      '// Track the previous iteration so the loop can compare totals.',
      '// Return the page as requested by the caller.',
      '// Keep both indexes, as discussed in #123.',
      '// Memoized per this request.',
      '// Truncate per the prompt budget.',
      '// Render the template, as the prompt expects.',
      ' * Returns the records you requested, newest first.',
      '// Echo what you said back to the user.',
      '// Back off if our last attempt failed.',
      '// Migrate settings from your previous version.',
      '// Append what the assistant said to the history.',
      "const message = 'as requested'; // shown in the toast",
      "const url = 'https://example.com/as-requested'; // see docs",
      "const text = 'x(); // as requested';",
      'const asRequested = changedFrom(previous);',
    ]) {
      await run('edit', edit(line));
    }
    await run('edit', edit('# As requested, see subprocess docs', '/project/notes.txt'));
    await run('write', { filePath: '/project/NOTES.md', content: '# As requested\n\nPer our discussion, ship it.' });
    await run('edit', edit('#header { color: red; } /* brand color */', '/project/site.css'));
    await run('bash', { command: 'echo "// as requested" > file.ts' });
    await run('edit', edit(`const minified = "${'a'.repeat(5000)}"; // as requested`));
  });

  it('ignores comment lines that the edit only keeps or moves', async () => {
    const existing = '// As requested, retry twice.';
    await run('edit', edit(`${existing}\nretry();`, '/project/src/app.ts', `${existing}\nattempt();`));
  });

  it('checks only lines added by write compared with the existing file', async (context) => {
    const directory = await mkdtemp(join(tmpdir(), 'comment-guard-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'app.ts'), '// As requested, retry twice.\nretry();\n');

    await run('write', { filePath: 'app.ts', content: '// As requested, retry twice.\nretry(3);\n' }, directory);
    await assert.rejects(
      run('write', { filePath: 'app.ts', content: '// You asked for three retries.\nretry(3);\n' }, directory),
      /You asked for three retries/,
    );
  });

  it('reads added lines from apply_patch file sections and hunks', async () => {
    await assertBlocked(
      'apply_patch',
      patch('*** Add File: src/new.ts', '+// Per our conversation, export a default.', '+export default 1;'),
      'src/new.ts: "Per our conversation, export a default."',
    );
    await assertBlocked(
      'apply_patch',
      patch(
        '*** Update File: src/app.ts',
        '*** Move to: src/main.ts',
        '@@ export function retry() {',
        ' /*',
        '+  As requested, retry twice.',
        ' */',
      ),
      'As requested, retry twice.',
    );
    const crlfPatch = patch(
      '*** Update File: src/app.ts',
      '@@',
      '-// As requested, retry twice.',
      '-attempt();',
      '+// As requested, retry twice.',
      '+retry();',
      '*** Delete File: src/old.ts',
      '*** Add File: README.md',
      '+As requested, more docs.',
    ).patchText.replace(/\n/g, '\r\n');
    await run('apply_patch', { patchText: crlfPatch });
  });

  it('blocks every new comment except directives in all mode, and nothing in off mode', async () => {
    process.env.OPENCODE_COMMENT_GUARD = 'all';
    await assertBlocked('edit', edit('// Retry twice.'), 'Retry twice.');
    for (const line of [
      '// eslint-disable-next-line no-console -- CLI output',
      '* { box-sizing: border-box; }',
      '*[Symbol.iterator]() {',
    ]) {
      await run('edit', edit(line, line.startsWith('* {') ? '/project/site.css' : '/project/src/app.ts'));
    }
    await run('edit', edit('# type: ignore', '/project/tool.py'));
    await run('edit', edit('# yaml-language-server: $schema=./schema.json', '/project/config.yaml'));
    await run('edit', edit('#include <stdio.h>', '/project/main.c'));
    await run('edit', edit('local q = a // b', '/project/init.lua'));
    await run('edit', edit('half = n // 2', '/project/Main.elm'));
    await run('edit', edit('f = a --> b', '/project/Main.hs'));
    await run('edit', edit('const ratio = total / count / 2;'));

    process.env.OPENCODE_COMMENT_GUARD = 'off';
    await run('edit', edit('// As requested, retry twice.'));
  });
});
