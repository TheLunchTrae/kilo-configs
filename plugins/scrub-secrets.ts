import type { Plugin, PluginInput } from '@kilocode/plugin';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isBlockedPath } from '../extensions/security/secret-paths.ts';

type Client = PluginInput['client'];

// Variable names whose values are treated as credentials. Delimited words avoid names such as TOKENIZERS_PARALLELISM.
const SECRET_NAME =
  /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIALS?)(?:_|$)/i;
// Names that locate a credential or store rather than holding one, such as AWS_WEB_IDENTITY_TOKEN_FILE.
const LOCATION_NAME = /(?:_FILE|_PATH|_DIR|_HOME)$|^PASSWORD_STORE_/i;
// Values that name an existing file, such as GOOGLE_APPLICATION_CREDENTIALS=/home/me/key.json. Checking existence
// keeps base64 secrets that happen to start with / from being mistaken for paths.
const PATH_VALUE = /^(?:\/|~\/|[a-z]:[\\/])\S+$/i;
const isExistingPath = (value: string): boolean =>
  PATH_VALUE.test(value) && existsSync(value.startsWith('~/') ? `${homedir()}${value.slice(1)}` : value);
// A URL with an embedded password, such as postgres://user:password@host/db or https://:token@host.
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)[^\s/@]+@/gi;
// Short values such as `postgres` would rewrite ordinary text, so only longer literal values are redacted.
const MIN_LITERAL_LENGTH = 12;
const MAX_DEPTH = 8;
// Preserve encoded payloads in MCP media/resources and built-in file attachments, not ordinary data fields.
type ResultContext = 'result' | 'content' | 'resource' | 'attachment' | 'ordinary';
const isBinaryPayload = (value: object, key: string, item: unknown, context: ResultContext): boolean => {
  if (typeof item !== 'string') {
    return false;
  }
  const type: unknown = Reflect.get(value, 'type');
  if (context === 'content' && key === 'data') {
    return (type === 'image' || type === 'audio') && typeof Reflect.get(value, 'mimeType') === 'string';
  }
  if (context === 'resource' && key === 'blob') {
    return typeof Reflect.get(value, 'uri') === 'string';
  }
  return (
    context === 'attachment' &&
    key === 'url' &&
    type === 'file' &&
    typeof Reflect.get(value, 'mime') === 'string' &&
    item.startsWith('data:')
  );
};

// Key blocks are matched by their body, so code that merely mentions a BEGIN or END marker stays readable.
// A line break is a real newline or an escaped \n inside a JSON or code string. Lines may be indented, as in YAML,
// and may carry the read tool's `N: ` or the grep tool's `Line N: ` prefix. Bodies are long base64 lines,
// optionally after armor headers.
const PREFIX = '[ \\t]*(?:\\d+: |Line \\d+: )?';
const LINE = `(?:\\r?\\n|\\\\n)${PREFIX}`;
const LINE_START = `(?:(?<=^|\\n)|(?<=\\\\n))${PREFIX}`;
const KEY_BEGIN = '-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----';
const KEY_END = '-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----';
const KEY_HEADERS = `(?:${LINE}(?:[A-Za-z][\\w-]*: [^\\n\\\\]*)?)*?`;
const KEY_BODY = `(?:${LINE}[A-Za-z0-9+/=]{32,})+(?:${LINE}[A-Za-z0-9+/=]+)?`;
// Body lines followed by END without BEGIN mean the text starts inside a key, as with an offset read.
// The search starts from each END marker and looks back over a bounded window, so large base64 text without
// a marker costs linear time. The window fits PEM and armored PGP private keys.
const KEY_END_MARKER = new RegExp(KEY_END, 'g');
const LONE_KEY_BODY = new RegExp(`${LINE_START}[A-Za-z0-9+/=]{32,}(?:${LINE}[A-Za-z0-9+/=]+)*${LINE}$`);
const KEY_WINDOW = 16_384;
const redactLoneKeyEnds = (text: string): string => {
  let result = '';
  let last = 0;
  for (const match of text.matchAll(KEY_END_MARKER)) {
    const start = Math.max(last, match.index - KEY_WINDOW);
    const body = LONE_KEY_BODY.exec(text.slice(start, match.index));
    if (body === null) {
      continue;
    }
    result += `${text.slice(last, start + body.index)}[REDACTED:private-key]`;
    last = match.index + match[0].length;
  }
  return last === 0 ? text : result + text.slice(last);
};

const REDACTIONS: readonly (readonly [string, RegExp])[] = [
  // A block ends at its END line or, when output was cut, after its last body line.
  ['private-key', new RegExp(`${KEY_BEGIN}${KEY_HEADERS}${KEY_BODY}(?:${LINE}${KEY_END})?`, 'g')],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['github-token', /\bgh[opsur]_[A-Za-z0-9]{36,255}\b/g],
  ['github-token', /\bgithub_pat_\w{22,255}\b/g],
  ['gitlab-token', /\bglpat-[\w-]{20,}\b/g],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ['api-key', /\bsk-[\w-]{20,}\b/g],
  ['stripe-key', /\b[rs]k_live_[A-Za-z0-9]{20,}\b/g],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/g],
  ['google-api-key', /\bAIza[\w-]{35}\b/g],
  ['jwt', /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g],
];
// Patches of files that block-secrets denies, as printed by `git diff`, `git log -p`, `git show <commit>`, or
// `diff -ru`. A `diff ` header or a `--- ` and `+++ ` pair names each file. Hunk lines of a denied file are dropped,
// and so is the text after its hunk headers, because Git copies a nearby file line there. A hunk ends when its header
// counts run out, or at the first line that cannot belong to it, so a cut or combined (`@@@`) hunk cannot hide the
// next `diff ` header. A denied hunk instead fails closed and drops other lines until a `diff `, `commit `, or `@@` line. `GIT binary patch` data of a denied file is dropped up to its second blank line. Color codes are
// ignored when matching. Word diffs, prefixed lines, and escaped text are not recognized.
const SECRET_DIFF = '[REDACTED:secret-file-diff]';
const HUNK_HEADER = /^@{2,} [^@]*@{2,}/;
const HUNK_COUNTS = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const HUNK_LINE = /^[ +\-\\]|^$/;
const BINARY_PATCH = 'GIT binary patch';
const NEW_UNIT = /^(?:diff |commit |From [\da-f]{7,} |@@|GIT binary patch|Binary files )/;
// eslint-disable-next-line no-control-regex -- Terminal color sequences start with ESC.
const COLOR = /\x1b\[[\d;]*m/g;
const BINARY_LINE = /^(?:(?:literal|delta) \d+|[A-Za-z][\w!#$%&()*+;<=>?@^`{|}~-]*)?$/;
const namesBlockedPath = (paths: readonly string[]): boolean =>
  paths.some((path) => !path.startsWith('-') && isBlockedPath(path.replace(/["']/g, '')) !== undefined);
// An omitted hunk count means one line.
const hunkCount = (value: string | undefined): number => (value === undefined ? 1 : Number(value));
const headerPath = (line: string): string => line.slice(4).split('\t')[0] ?? '';
const redactSecretDiffs = (text: string): string => {
  if (!text.includes('@@') && !text.includes(BINARY_PATCH)) {
    return text;
  }
  let secret = false;
  let headerSecret = false;
  // Lines left in the current hunk from each side; undefined outside a hunk, and NaN in a combined hunk.
  let oldLeft: number | undefined;
  let newLeft = 0;
  // Blank lines left in a denied binary patch: one after the forward data and one after the reverse data.
  let binaryBlanks = 0;
  let changed = false;
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    const eol = line.endsWith('\r') ? '\r' : '';
    const content = (eol === '' ? line : line.slice(0, -1)).replace(COLOR, '');
    if (binaryBlanks > 0) {
      if (BINARY_LINE.test(content)) {
        if (content === '') {
          binaryBlanks--;
        }
        continue;
      }
      binaryBlanks = 0;
    }
    if (oldLeft !== undefined && !HUNK_LINE.test(content)) {
      // A denied hunk fails closed: word diffs, graph prefixes, or a cut marker drop until a new unit starts.
      if (secret && !NEW_UNIT.test(content)) {
        continue;
      }
      oldLeft = undefined;
    }
    if (oldLeft !== undefined) {
      if (!Number.isNaN(oldLeft)) {
        const marker = content[0];
        if (marker !== '+' && marker !== '\\') {
          oldLeft--;
        }
        if (marker !== '-' && marker !== '\\') {
          newLeft--;
        }
        if (oldLeft <= 0 && newLeft <= 0) {
          oldLeft = undefined;
        }
      }
      if (secret) {
        continue;
      }
      lines.push(line);
      continue;
    }
    const hunk = HUNK_HEADER.exec(content);
    if (content.startsWith('diff ')) {
      headerSecret = namesBlockedPath(content.split(/\s+/).slice(1));
      secret = headerSecret;
    } else if (content.startsWith('--- ')) {
      // The first pair after a `diff ` header keeps its verdict; later pairs belong to header-less patches.
      secret = headerSecret || namesBlockedPath([headerPath(content)]);
      headerSecret = false;
    } else if (content.startsWith('+++ ')) {
      secret ||= namesBlockedPath([headerPath(content)]);
    } else if (content === BINARY_PATCH && secret) {
      lines.push(line, SECRET_DIFF + eol);
      binaryBlanks = 2;
      changed = true;
      continue;
    } else if (hunk !== null) {
      const counts = HUNK_COUNTS.exec(content);
      oldLeft = counts === null ? Number.NaN : hunkCount(counts[1]);
      newLeft = counts === null ? 0 : hunkCount(counts[2]);
      if (oldLeft === 0 && newLeft === 0) {
        oldLeft = undefined;
      }
      if (secret) {
        lines.push(hunk[0] + eol, SECRET_DIFF + eol);
        changed = true;
        continue;
      }
    }
    lines.push(line);
  }
  return changed ? lines.join('\n') : text;
};

const BEARER = /(authorization:\s*bearer\s+)[\w.~+/-]+=*/gi;

const hasUrlPassword = (value: string): boolean => {
  URL_PASSWORD.lastIndex = 0;
  return URL_PASSWORD.test(value);
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const notify = (client: Client, kinds: ReadonlySet<string>, tool: string): void => {
  void client.tui
    .showToast({
      body: {
        title: 'scrub-secrets',
        message: `Redacted ${[...kinds].join(', ')} from ${tool} output`,
        variant: 'warning',
      },
    })
    .catch(() => {
      // toast surface unavailable (headless run, server down) — redaction already applied
    });
};

// eslint-disable-next-line @typescript-eslint/require-await -- Kilo's plugin factory requires a Promise result.
export const ScrubSecretsPlugin: Plugin = async ({ client }) => {
  // KILO_SCRUB_ENV_ALLOW names variables that shell commands still need, separated by commas.
  const allowed = new Set(
    (process.env.KILO_SCRUB_ENV_ALLOW ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  );
  const secrets = Object.entries(process.env).flatMap(([name, value]) => {
    if (value === undefined || value === '' || allowed.has(name)) {
      return [];
    }
    const named = SECRET_NAME.test(name) && !LOCATION_NAME.test(name) && !isExistingPath(value);
    return named || hasUrlPassword(value) ? [[name, value] as const] : [];
  });
  const secretNames = secrets.map(([name]) => name);
  // Literal values of scrubbed variables are also redacted if a tool prints them from another source.
  const literals = secrets
    .filter(([, value]) => value.length >= MIN_LITERAL_LENGTH)
    .map(([name, value]) => [name, new RegExp(escapeRegExp(value), 'g')] as const);

  const redact = (text: string, kinds: Set<string>): string => {
    let result = text;
    const apply = (kind: string, pattern: RegExp, replacement: string) => {
      const next = result.replace(pattern, replacement);
      if (next !== result) {
        kinds.add(kind);
        result = next;
      }
    };
    const withoutSecretDiffs = redactSecretDiffs(result);
    if (withoutSecretDiffs !== result) {
      kinds.add('secret file diff');
      result = withoutSecretDiffs;
    }
    for (const [name, pattern] of literals) {
      apply('environment value', pattern, `[REDACTED:env:${name}]`);
    }
    for (const [kind, pattern] of REDACTIONS) {
      apply(kind, pattern, `[REDACTED:${kind}]`);
    }
    const withoutKeyEnds = redactLoneKeyEnds(result);
    if (withoutKeyEnds !== result) {
      kinds.add('private-key');
      result = withoutKeyEnds;
    }
    apply('bearer', BEARER, '$1[REDACTED:bearer]');
    apply('url-password', URL_PASSWORD, '$1[REDACTED:url-password]@');
    return result;
  };

  // Built-in tools return { output, metadata }; MCP tools return { content: [...] }; failed subtasks return nothing.
  // Every string in the result is redacted in place, except encoded binary payloads.
  const walk = (value: unknown, kinds: Set<string>, depth: number, context: ResultContext): unknown => {
    if (typeof value === 'string') {
      return redact(value, kinds);
    }
    if (depth >= MAX_DEPTH || typeof value !== 'object' || value === null) {
      return value;
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        value[index] = walk(value[index], kinds, depth + 1, context);
      }
      return value;
    }
    for (const [key, item] of Object.entries(value)) {
      if (!isBinaryPayload(value, key, item, context)) {
        let childContext: ResultContext = 'ordinary';
        if (context === 'result' && Array.isArray(item)) {
          if (key === 'content') {
            childContext = 'content';
          } else if (key === 'attachments') {
            childContext = 'attachment';
          }
        } else if (context === 'content' && Reflect.get(value, 'type') === 'resource' && key === 'resource') {
          childContext = 'resource';
        }
        Reflect.set(value, key, walk(item, kinds, depth + 1, childContext));
      }
    }
    return value;
  };

  return {
    // The host merges this result over its own environment, so a blank value is the only available removal.
    // Terminal panels call the hook without a session or tool call; their output is not sent to the model.
    // eslint-disable-next-line @typescript-eslint/require-await -- The hook contract returns a Promise.
    'shell.env': async (input, output) => {
      if (input.sessionID === undefined && input.callID === undefined) {
        return;
      }
      for (const name of secretNames) {
        output.env[name] = '';
      }
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- The hook contract returns a Promise.
    'tool.execute.after': async (input, output: unknown) => {
      const kinds = new Set<string>();
      walk(output, kinds, 0, 'result');
      if (kinds.size > 0) {
        notify(client, kinds, input.tool);
      }
    },
  };
};
