import type { Plugin, PluginInput } from '@kilocode/plugin';
import { isBlockedPath } from '../extensions/security/secret-paths.ts';

type Client = PluginInput['client'];

const PATH_TOOL_ARG_KEYS = ['filePath', 'file_path', 'path'] as const;

// Shell control operators end a word, so `cat .env|head` and `$(cat .env)` expose the path as its own token.
const COMMAND_SEPARATORS = /[\s;|&<>`]+/;
// Quotes are removed rather than trimmed because the shell joins quoted parts, as in HEAD:".env".
const QUOTES = /["']/g;
const SUBSTITUTION_EDGES = /^[$({]+|[)}]+$/g;

// A path can follow `:` or `=` inside a word, as in `git show HEAD:.env`, `git cat-file -p :0:.env`, or
// `--file=.env`. Ref names cannot contain `:`, so every suffix after a separator is checked as a path.
const pathCandidates = (token: string): string[] => {
  const candidates = [token];
  for (let index = 0; index < token.length; index++) {
    if (token[index] === ':' || token[index] === '=') {
      candidates.push(token.slice(index + 1));
    }
  }
  return candidates;
};

const firstBlockedPathInCommand = (command: string): { path: string; pattern: string } | undefined => {
  for (const raw of command.split(COMMAND_SEPARATORS)) {
    const cleaned = raw.replace(QUOTES, '').replace(SUBSTITUTION_EDGES, '');
    for (const candidate of pathCandidates(cleaned)) {
      const hit = isBlockedPath(candidate);
      if (hit !== undefined) {
        return { path: cleaned, pattern: hit };
      }
    }
  }
  return undefined;
};

// Toast is best-effort additive UX — the thrown error is what actually stops
// the tool call. A toast failure must not mask the underlying block reason.
const notifyBlocked = (client: Client, path: string, pattern: string): void => {
  void client.tui
    .showToast({
      body: {
        title: 'block-secrets',
        message: `Blocked ${path} (pattern ${pattern})`,
        variant: 'error',
      },
    })
    .catch(() => {
      // toast surface unavailable (headless run, server down) — swallow
    });
};

const reject = (client: Client, path: string, pattern: string, reason: string): never => {
  notifyBlocked(client, path, pattern);
  throw new Error(`blocked by block-secrets plugin: ${reason}. Sensitive-file access is denied by policy.`);
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

// eslint-disable-next-line @typescript-eslint/require-await -- Kilo's plugin factory requires a Promise result.
export const BlockSecretsPlugin: Plugin = async ({ client }) => ({
  // eslint-disable-next-line @typescript-eslint/require-await -- The hook contract returns a Promise so blocked calls reject asynchronously.
  'tool.execute.before': async (input, output) => {
    const toolName = input.tool.toLowerCase();
    const rawArgs: unknown = output.args;
    const args = isRecord(rawArgs) ? rawArgs : {};

    if (toolName === 'bash') {
      const command = typeof args.command === 'string' ? args.command : '';
      const hit = firstBlockedPathInCommand(command);
      if (hit !== undefined) {
        reject(client, hit.path, hit.pattern, `bash command references ${hit.path} (pattern ${hit.pattern})`);
      }
      return;
    }

    if (toolName === 'glob' && typeof args.pattern === 'string') {
      const hit = isBlockedPath(args.pattern);
      if (hit !== undefined) {
        reject(client, args.pattern, hit, `glob attempted to access ${args.pattern} (pattern ${hit})`);
      }
    }

    for (const key of PATH_TOOL_ARG_KEYS) {
      const value = args[key];
      if (typeof value !== 'string') {
        continue;
      }
      const hit = isBlockedPath(value);
      if (hit !== undefined) {
        reject(
          client,
          value,
          hit,
          `${toolName.length === 0 ? 'tool' : toolName} attempted to access ${value} (pattern ${hit})`,
        );
      }
    }
  },
});
