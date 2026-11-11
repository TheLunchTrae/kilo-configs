import { posix } from 'node:path';

// Shared by plugins that check tool path arguments. This module lives outside the
// auto-discovered plugin directory so the loader does not treat its exports as plugins.
const BLOCKED_PATTERNS: readonly RegExp[] = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.[^/]+$/,
  /\.pem$/,
  /(^|\/)id_rsa($|\.)/,
  /(^|\/)id_ed25519($|\.)/,
  /(^|\/)id_ecdsa($|\.)/,
  /(^|\/)id_dsa($|\.)/,
  /\.key$/,
  /(^|\/)credentials\.json$/,
  /(^|\/)\.netrc$/,
  /(^|\/)secrets\.(json|yaml|yml)$/,
  /\.p12$/,
  /\.pfx$/,
  /(^|\/)\.aws\/credentials$/,
  /(^|\/)\.ssh\/.*$/,
];

const ALLOWED_BASENAMES: ReadonlySet<string> = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
  '.env.defaults',
  '.env.dist',
]);

// eslint-disable-next-line regexp/no-unused-capturing-group -- Preserve the pattern source shown in blocked-path diagnostics.
const SECRETS_DIRECTORY_PATTERN = /(^|\/)secrets(\/|$)/;

/** Returns the matching pattern source for a sensitive path, or undefined when the path is allowed. */
export const isBlockedPath = (raw: string): string | undefined => {
  if (raw.length === 0) {
    return undefined;
  }
  const normalized = raw.replaceAll('\\', '/').toLowerCase();
  if (SECRETS_DIRECTORY_PATTERN.test(normalized)) {
    return SECRETS_DIRECTORY_PATTERN.source;
  }
  if (ALLOWED_BASENAMES.has(posix.basename(normalized))) {
    return undefined;
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      return pattern.source;
    }
  }
  return undefined;
};

/**
 * Git exclude pathspecs approximating the patterns above, for commands that read file contents.
 * Pathspecs cannot re-include template basenames, so `.env.example` and similar files are also excluded.
 */
export const secretExcludePathspecs: readonly string[] = [
  '.env',
  '.env.*',
  '*.pem',
  'id_rsa',
  'id_rsa.*',
  'id_ed25519',
  'id_ed25519.*',
  'id_ecdsa',
  'id_ecdsa.*',
  'id_dsa',
  'id_dsa.*',
  '*.key',
  'credentials.json',
  '.netrc',
  'secrets.json',
  'secrets.yaml',
  'secrets.yml',
  '*.p12',
  '*.pfx',
  '.aws/credentials',
  '.ssh/**',
  'secrets',
  'secrets/**',
].flatMap((pattern) => [`:(top,exclude,icase,glob)${pattern}`, `:(top,exclude,icase,glob)**/${pattern}`]);
