import type { PluginInput } from '@opencode-ai/plugin';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { ScrubSecretsPlugin } from '../plugins/scrub-secrets.ts';

// Synthetic values only. They match credential formats but are not real credentials.
const body = `QUFBQXN5bnRoZXRpYy${'A'.repeat(46)}`;
const credentialsFile = join(tmpdir(), 'scrub-secrets-credentials.json');
const fake = {
  github: `ghp_${'a'.repeat(36)}`,
  aws: 'AKIAABCDEFGHIJKLMNOP',
  openai: `sk-proj-${'b'.repeat(40)}`,
  jwt: `eyJ${'c'.repeat(12)}.eyJ${'d'.repeat(12)}.${'e'.repeat(12)}`,
  key: `-----BEGIN OPENSSH PRIVATE KEY-----\n${body}\n${body}\nAAAA==\n-----END OPENSSH PRIVATE KEY-----`,
  env: 'synthetic-env-value-123',
};

const variables = {
  SCRUB_TEST_API_TOKEN: fake.env,
  SCRUB_TEST_DATABASE_URL: 'postgres://app:synthetic-password@db.example.invalid/app',
  SCRUB_TEST_TOKENIZERS_PARALLELISM: 'false',
  SCRUB_TEST_ALLOWED_TOKEN: 'kept-for-tools',
  PASSWORD_STORE_DIR: '/home/test/.password-store',
  SCRUB_TEST_IDENTITY_TOKEN_FILE: '/var/run/secrets/token',
  SCRUB_TEST_APPLICATION_CREDENTIALS: credentialsFile,
  SCRUB_TEST_SLASH_SECRET: '/wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY',
  SCRUB_TEST_SHORT_PASSWORD: 'postgres',
};
const saved = new Map<string, string | undefined>();

const create = async () => {
  const showToast = mock.fn(async () => ({ data: undefined }));
  const hooks = await ScrubSecretsPlugin({ client: { tui: { showToast } } } as unknown as PluginInput);
  const env = hooks['shell.env'];
  const after = hooks['tool.execute.after'];
  assert.ok(env !== undefined && after !== undefined);
  return { env, after, showToast };
};

describe('scrub-secrets plugin', () => {
  before(() => {
    writeFileSync(credentialsFile, '{}');
  });
  after(() => {
    rmSync(credentialsFile, { force: true });
  });
  beforeEach(() => {
    for (const [name, value] of Object.entries({
      ...variables,
      OPENCODE_SCRUB_ENV_ALLOW: 'SCRUB_TEST_ALLOWED_TOKEN',
    })) {
      saved.set(name, process.env[name]);
      process.env[name] = value;
    }
  });
  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
      } else {
        process.env[name] = value;
      }
    }
    saved.clear();
  });

  it('blanks credential variables for agent shell calls', async () => {
    const { env } = await create();
    const output = { env: {} as Record<string, string> };
    await env({ cwd: '/project', sessionID: 'session', callID: 'call' }, output);
    assert.equal(output.env.SCRUB_TEST_API_TOKEN, '');
    assert.equal(output.env.SCRUB_TEST_DATABASE_URL, '');
    assert.equal('SCRUB_TEST_TOKENIZERS_PARALLELISM' in output.env, false);
    assert.equal('SCRUB_TEST_ALLOWED_TOKEN' in output.env, false);
    assert.equal('PASSWORD_STORE_DIR' in output.env, false);
    assert.equal('SCRUB_TEST_IDENTITY_TOKEN_FILE' in output.env, false);
    assert.equal('SCRUB_TEST_APPLICATION_CREDENTIALS' in output.env, false);
    assert.equal(output.env.SCRUB_TEST_SHORT_PASSWORD, '');
    assert.equal(output.env.SCRUB_TEST_SLASH_SECRET, '');
  });

  it('leaves terminal panels without a session unchanged', async () => {
    const { env } = await create();
    const output = { env: {} as Record<string, string> };
    await env({ cwd: '/project' }, output);
    assert.deepEqual(output.env, {});
  });

  it('redacts credential formats, environment values, and URL passwords from output', async () => {
    const { after, showToast } = await create();
    const text = [
      `token=${fake.github}`,
      `aws=${fake.aws}`,
      `openai=${fake.openai}`,
      `Authorization: Bearer ${fake.jwt}`,
      fake.key,
      `leaked ${fake.env}`,
      'url=postgres://app:synthetic-password@db.example.invalid/app',
      'other=mysql://root:other-synthetic-password@localhost/app',
    ].join('\n');
    const output = { title: '', output: text, metadata: { output: text } };
    await after({ tool: 'bash', sessionID: 'session', callID: 'call', args: {} }, output);
    for (const value of [
      fake.github,
      fake.aws,
      fake.openai,
      fake.jwt,
      'QUFBQXN5bnRoZXRpYy',
      fake.env,
      'synthetic-password',
    ]) {
      assert.equal(output.output.includes(value), false, value);
      assert.equal(output.metadata.output.includes(value), false, value);
    }
    assert.match(output.output, /\[REDACTED:github-token\]/);
    assert.match(output.output, /\[REDACTED:env:SCRUB_TEST_API_TOKEN\]/);
    assert.match(output.output, /\[REDACTED:env:SCRUB_TEST_DATABASE_URL\]/);
    assert.match(output.output, /mysql:\/\/root:\[REDACTED:url-password\]@localhost/);
    assert.equal(showToast.mock.callCount(), 1);
  });

  it('leaves ordinary output and the toast untouched', async () => {
    const { after, showToast } = await create();
    const text = 'sk-short\nTOKENIZERS_PARALLELISM=false\nhttps://example.invalid/path\nkept-for-tools';
    const output = { title: '', output: text, metadata: {} };
    await after({ tool: 'read', sessionID: 'session', callID: 'call', args: {} }, output);
    assert.equal(output.output, text);
    assert.equal(showToast.mock.callCount(), 0);
  });

  it('redacts MCP content and tolerates missing results', async () => {
    const { after } = await create();
    const output = {
      content: [
        { type: 'text', text: `token ${fake.github}` },
        { type: 'resource', resource: { uri: 'file:///x', text: fake.jwt } },
      ],
      structuredContent: { nested: { key: fake.aws } },
    };
    await after({ tool: 'github_get_file', sessionID: 's', callID: 'c', args: {} }, output as never);
    const text = JSON.stringify(output);
    for (const value of [fake.github, fake.jwt, fake.aws]) {
      assert.equal(text.includes(value), false, value);
    }
    await after({ tool: 'task', sessionID: 's', callID: 'c', args: {} }, undefined as never);
  });

  it('redacts ordinary data, blob, and attachment fields in structured results', async () => {
    const { after } = await create();
    const output = {
      structuredContent: {
        data: { token: fake.github },
        blob: fake.aws,
        attachments: [{ data: fake.jwt }],
        resource: { uri: 'file:///ordinary', blob: fake.aws },
        content: [{ type: 'image', mimeType: 'image/png', data: fake.aws }],
        file: { type: 'file', mime: 'image/png', url: `data:image/png;base64,${fake.aws}` },
      },
      metadata: { data: fake.env },
    };
    await after({ tool: 'mcp_tool', sessionID: 's', callID: 'c', args: {} }, output as never);
    assert.deepEqual(output.structuredContent, {
      data: { token: '[REDACTED:github-token]' },
      blob: '[REDACTED:aws-access-key]',
      attachments: [{ data: '[REDACTED:jwt]' }],
      resource: { uri: 'file:///ordinary', blob: '[REDACTED:aws-access-key]' },
      content: [{ type: 'image', mimeType: 'image/png', data: '[REDACTED:aws-access-key]' }],
      file: { type: 'file', mime: 'image/png', url: 'data:image/png;base64,[REDACTED:aws-access-key]' },
    });
    assert.equal(output.metadata.data, '[REDACTED:env:SCRUB_TEST_API_TOKEN]');
  });

  it('preserves encoded payloads while redacting their text metadata', async () => {
    const { after } = await create();
    // This synthetic AWS-shaped string is also valid base64 and must remain intact in binary fields.
    const payload = fake.aws;
    const output = {
      content: [
        { type: 'image', mimeType: 'image/png', data: payload },
        { type: 'audio', mimeType: 'audio/wav', data: payload },
        { type: 'resource', resource: { uri: 'file:///sample', blob: payload } },
      ],
      attachments: [
        { type: 'file', mime: 'image/png', url: `data:image/png;base64,${payload}`, filename: fake.github },
      ],
    };
    await after({ tool: 'mcp_tool', sessionID: 's', callID: 'c', args: {} }, output as never);
    assert.equal(output.content[0]?.data, payload);
    assert.equal(output.content[1]?.data, payload);
    assert.equal(output.content[2]?.resource?.blob, payload);
    assert.equal(output.attachments[0]?.url, `data:image/png;base64,${payload}`);
    assert.equal(output.attachments[0]?.filename, '[REDACTED:github-token]');
  });

  it('redacts partial private keys and PGP key blocks', async () => {
    const { after } = await create();
    for (const text of [
      `-----BEGIN RSA PRIVATE KEY-----\n${body}\n${body}`,
      `12: ${body}\n13: ${body}\n14: AB==\n15: -----END EC PRIVATE KEY-----\n16: after`,
      `-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: test\n\n${body}\n=AbCd\n-----END PGP PRIVATE KEY BLOCK-----`,
      `-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,00\n\n${body}\n-----END RSA PRIVATE KEY-----`,
    ]) {
      const output = { title: '', output: text, metadata: {} };
      await after({ tool: 'read', sessionID: 's', callID: 'c', args: {} }, output);
      assert.doesNotMatch(output.output, /QUFBQXN5bnRoZXRpYy/, text);
    }
  });

  it('redacts keys in JSON strings, indented YAML, and grep output', async () => {
    const { after } = await create();
    const lines = ['-----BEGIN PRIVATE KEY-----', body, body, 'AB==', '-----END PRIVATE KEY-----'];
    for (const text of [
      JSON.stringify({ type: 'service_account', private_key: `${lines.join('\n')}\n` }),
      `key: |\n${lines.map((line) => `    ${line}`).join('\n')}\nnext: value`,
      lines.map((line, index) => `  Line ${String(index + 3)}: ${line}`).join('\n'),
    ]) {
      const output = { title: '', output: text, metadata: {} };
      await after({ tool: 'read', sessionID: 's', callID: 'c', args: {} }, output);
      assert.doesNotMatch(output.output, /QUFBQXN5bnRoZXRpYy/, text);
    }
  });

  it('handles large base64 output in linear time', async () => {
    const { after } = await create();
    const line = `${'QUJD'.repeat(19)}\n`;
    for (const text of [line.repeat(14_000), `${line.repeat(14_000)}-----END PRIVATE KEY-----\n`]) {
      const output = { title: '', output: text, metadata: {} };
      const started = performance.now();
      await after({ tool: 'mcp_tool', sessionID: 's', callID: 'c', args: {} }, output);
      assert.ok(performance.now() - started < 1000, `took ${String(performance.now() - started)} ms`);
    }
  });

  it('leaves code that only mentions key markers readable', async () => {
    const { after, showToast } = await create();
    const text = [
      "1: if (pem.startsWith('-----BEGIN PRIVATE KEY-----')) {",
      '2:   return parse(pem);',
      '3: }',
      '4: const footer = "-----END RSA PRIVATE KEY-----";',
      '5: export default footer;',
    ].join('\n');
    const output = { title: '', output: text, metadata: {} };
    await after({ tool: 'read', sessionID: 's', callID: 'c', args: {} }, output);
    assert.equal(output.output, text);
    assert.equal(showToast.mock.callCount(), 0);
  });

  it('keeps short environment values in ordinary text and redacts empty-user URL passwords', async () => {
    const { after } = await create();
    const output = { title: '', output: 'database: postgres\nhttps://:synthetic-url-token@host.invalid', metadata: {} };
    await after({ tool: 'read', sessionID: 's', callID: 'c', args: {} }, output);
    assert.match(output.output, /database: postgres/);
    assert.doesNotMatch(output.output, /synthetic-url-token/);
  });

  it('still redacts when the toast fails', async () => {
    const showToast = mock.fn(async () => Promise.reject(new Error('no tui')));
    const hooks = await ScrubSecretsPlugin({ client: { tui: { showToast } } } as unknown as PluginInput);
    const output = { title: '', output: fake.github, metadata: {} };
    await hooks['tool.execute.after']?.({ tool: 'grep', sessionID: 's', callID: 'c', args: {} }, output);
    assert.equal(output.output, '[REDACTED:github-token]');
  });
});
