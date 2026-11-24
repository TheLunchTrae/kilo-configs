import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { rcompare, satisfies, valid, validRange } from 'semver';
// Kilo installs each npm plugin spec once into `<cache>/packages/<spec>` and reuses that directory while
// `node_modules/<name>` exists. A bare spec is installed as `<name>@latest`. Nothing expires these directories, so a
// dist-tag such as `@latest` or a range such as `^1.2.0` keeps the version that was current at the first install.
const PACKAGE_NAME = /^(?:@[a-z0-9~-][\w.~-]*\/)?[a-z0-9~-][\w.~-]*$/i;
// A dist-tag must not parse as a semver version or range. Ranges start with a digit, `v` and a digit, an operator,
// or an `x` wildcard; tags are otherwise limited to the characters a cache directory name can hold. On Windows the
// cache directory name replaces `<`, `>`, and `*` with `_`, so such ranges no longer parse and are skipped.
const DIST_TAG = /^[a-z][\w.-]*$/i;
const RANGE_LIKE_TAG = /^(?:v\d|[x*](?:\.|$))/i;
const STALE_DIRECTORY = '.stale';
const STATE_FILE = '.plugin-cache-refresh.json';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const REQUEST_TIMEOUT_MS = 10_000;
// npm parses versions and ranges loosely.
const LOOSE = { loose: true };

export interface CachedPackage {
  readonly name: string;
  // The dist-tag or semver range after the package name, as in `latest` or `^1.2.0`.
  readonly spec: string;
  readonly kind: 'tag' | 'range';
  readonly entry: string;
  readonly directory: string;
  readonly installedVersion: string;
}

export interface OutdatedPackage extends CachedPackage {
  readonly availableVersion: string;
}

export interface PackumentVersion {
  readonly version: string;
  readonly deprecated: boolean;
  // The `engines.node` range the version declares, if any.
  readonly node?: string;
}

export interface Packument {
  readonly distTags: Readonly<Partial<Record<string, string>>>;
  readonly versions: readonly PackumentVersion[];
}

export type PackumentLookup = (name: string) => Promise<Packument | undefined>;

export interface FindOptions {
  readonly packagesDirectory: string;
  readonly fetchPackument: PackumentLookup;
  readonly warn: (message: string, extra: Record<string, unknown>) => Promise<void> | void;
}

export interface NpmSettings {
  readonly registry: string;
  readonly scopes: Readonly<Record<string, string>>;
  // Credential fields by registry "nerf dart", the `//host/path/` form npmrc credential keys use.
  readonly credentials: Readonly<Partial<Record<string, CredentialFields>>>;
  readonly pinnedDate: boolean;
}

export type CredentialFields = Partial<Record<'_authToken' | '_auth' | 'username' | '_password', string>>;

export type NpmrcValues = Partial<Pick<NpmSettings, 'registry'>> & Omit<NpmSettings, 'registry'>;

export function defaultPackagesDirectory(env: NodeJS.ProcessEnv = process.env): string {
  // xdg-basedir, which Kilo uses, treats an empty XDG_CACHE_HOME as unset. Kilo also removes newline characters.
  const cacheHome =
    env.XDG_CACHE_HOME === undefined || env.XDG_CACHE_HOME === '' ? join(homedir(), '.cache') : env.XDG_CACHE_HOME;
  return join(cacheHome.replace(/[\r\n]+/g, ''), 'kilo', 'packages');
}

const trimRegistry = (registry: string) => registry.replace(/\/+$/, '');

const expandEnvironment = (value: string, env: NodeJS.ProcessEnv) =>
  value.replace(/\$\{([^}]+)\}/g, (_match, name: string) => env[name] ?? '');

export function nerfDart(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
    return `//${parsed.host}${path}`;
  } catch {
    return undefined;
  }
}

const CREDENTIAL_FIELDS: readonly string[] = ['_authToken', '_auth', 'username', '_password'];
const isCredentialField = (field: string): field is keyof CredentialFields => CREDENTIAL_FIELDS.includes(field);

const CREDENTIAL_KEY = /^(\/\/.+\/):(_authToken|_auth|username|_password)$/;

// Reads the settings that decide where a plugin install comes from and how it authenticates: `registry`,
// `@scope:registry`, `before`, and per-registry `_authToken`, `_auth`, or `username` with `_password`.
// Other keys are ignored. Credential values are kept only to send to the registry they are configured for.
export function parseNpmrc(text: string, env: NodeJS.ProcessEnv = process.env): NpmrcValues {
  let registry: string | undefined;
  const scopes: Record<string, string> = {};
  const credentials: Record<string, CredentialFields> = {};
  let pinnedDate = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = expandEnvironment(
      line
        .slice(separator + 1)
        .trim()
        .replace(/^(["'])(.*)\1$/, '$2'),
      env,
    );
    if (value === '') {
      continue;
    }
    const credential = CREDENTIAL_KEY.exec(key);
    if (key === 'registry') {
      registry = trimRegistry(value);
    } else if (/^@[^:]+:registry$/.test(key)) {
      scopes[key.slice(0, key.indexOf(':'))] = trimRegistry(value);
    } else if (key === 'before') {
      pinnedDate = true;
    } else if (credential !== null) {
      const [, dart, field] = credential;
      if (isCredentialField(field)) {
        credentials[dart] = { ...credentials[dart], [field]: value };
      }
    }
  }
  return { ...(registry === undefined ? {} : { registry }), scopes, credentials, pinnedDate };
}

const nonEmpty = (...values: (string | undefined)[]) => values.find((value) => value !== undefined && value !== '');

const readNpmrc = (file: string | undefined, env: NodeJS.ProcessEnv): NpmrcValues | undefined => {
  if (file === undefined) {
    return undefined;
  }
  try {
    return parseNpmrc(readFileSync(file, 'utf8'), env);
  } catch {
    // A missing or unreadable npmrc leaves the other sources in place.
    return undefined;
  }
};

// Follows npm's precedence: environment variables, then the user npmrc, then the global npmrc. The global npmrc
// is read only when `npm_config_globalconfig` names it, because its default location depends on the npm prefix.
// Kilo installs from its cache directory, so a project npmrc does not apply to plugin installs.
export function npmSettings(env: NodeJS.ProcessEnv = process.env): NpmSettings {
  const files = [
    readNpmrc(nonEmpty(env.npm_config_globalconfig, env.NPM_CONFIG_GLOBALCONFIG), env),
    readNpmrc(nonEmpty(env.npm_config_userconfig, env.NPM_CONFIG_USERCONFIG) ?? join(homedir(), '.npmrc'), env),
  ].filter((values) => values !== undefined);
  const scopes: Record<string, string> = {};
  const credentials: Record<string, CredentialFields> = {};
  for (const values of files) {
    Object.assign(scopes, values.scopes);
    // npm merges each credential field separately, so a username and password can come from different files.
    for (const [dart, fields] of Object.entries(values.credentials)) {
      credentials[dart] = { ...credentials[dart], ...fields };
    }
  }
  for (const [key, value] of Object.entries(env)) {
    const scope = /^npm_config_(@[^:]+):registry$/i.exec(key)?.[1];
    const registry = nonEmpty(value);
    if (scope !== undefined && registry !== undefined) {
      scopes[scope] = trimRegistry(registry);
    }
  }
  const registry =
    nonEmpty(env.npm_config_registry, env.NPM_CONFIG_REGISTRY) ??
    files.findLast((values) => values.registry !== undefined)?.registry ??
    DEFAULT_REGISTRY;
  return {
    registry: trimRegistry(registry),
    scopes,
    credentials,
    pinnedDate:
      nonEmpty(env.npm_config_before, env.NPM_CONFIG_BEFORE) !== undefined || files.some((values) => values.pinnedDate),
  };
}

const authorizationHeader = (fields: CredentialFields): string | undefined => {
  if (fields._authToken !== undefined) {
    return `Bearer ${fields._authToken}`;
  }
  if (fields._auth !== undefined) {
    return `Basic ${fields._auth}`;
  }
  if (fields.username !== undefined && fields._password !== undefined) {
    const password = Buffer.from(fields._password, 'base64').toString('utf8');
    return `Basic ${Buffer.from(`${fields.username}:${password}`).toString('base64')}`;
  }
  return undefined;
};

// Like npm, this walks from the registry URL up through its parent paths on the same host and uses the first one
// that has any credential field. An incomplete credential there gives no authorization.
export function registryAuthorization(settings: NpmSettings, registry: string): string | undefined {
  let dart = nerfDart(registry);
  while (dart !== undefined) {
    const fields = settings.credentials[dart];
    if (fields !== undefined) {
      return authorizationHeader(fields);
    }
    const parent = dart.replace(/[^/]+\/$/, '');
    dart = parent === dart || parent === '//' ? undefined : parent;
  }
  return undefined;
}

export function parseCacheEntry(entry: string): Pick<CachedPackage, 'name' | 'spec' | 'kind'> | undefined {
  const separator = entry.indexOf('@', entry.startsWith('@') ? entry.indexOf('/') + 1 : 0);
  if (separator <= 0) {
    return undefined;
  }
  const name = entry.slice(0, separator);
  const spec = entry.slice(separator + 1);
  if (!PACKAGE_NAME.test(name)) {
    return undefined;
  }
  if (DIST_TAG.test(spec) && !RANGE_LIKE_TAG.test(spec)) {
    return { name, spec, kind: 'tag' };
  }
  // An exact version never changes, so only ranges are checked. `_` never appears in a range, but Windows cache names
  // use it in place of `<`, `>`, `|`, and `*`, and loose parsing would still accept some of those names.
  if (!spec.includes('_') && valid(spec, LOOSE) === null && validRange(spec, LOOSE) !== null) {
    return { name, spec, kind: 'range' };
  }
  return undefined;
}

// npm-install-checks treats a version as installable when the running Node version satisfies its `engines.node`.
const engineOk = (item: PackumentVersion, nodeVersion: string) =>
  item.node === undefined || satisfies(nodeVersion, item.node, { includePrerelease: true });

// Follows npm-pick-manifest for a range. The `latest` dist-tag wins when it satisfies the range (a literal `*` always
// does), is published, is not deprecated, and supports the running Node version. Otherwise the satisfying versions are
// ranked: not deprecated and engine-compatible first, then engine-compatible, then not deprecated, then highest.
export function resolveSpec(
  packument: Packument,
  entry: Pick<CachedPackage, 'spec' | 'kind'>,
  nodeVersion: string = process.version,
): string | undefined {
  if (entry.kind === 'tag') {
    return packument.distTags[entry.spec];
  }
  const latest = packument.distTags.latest;
  if (latest !== undefined && (entry.spec === '*' || satisfies(latest, entry.spec, LOOSE))) {
    const manifest = packument.versions.find((item) => item.version === latest);
    if (manifest !== undefined && !manifest.deprecated && engineOk(manifest, nodeVersion)) {
      return latest;
    }
  }
  const rank = (item: PackumentVersion) => {
    const engine = engineOk(item, nodeVersion);
    return [Number(!item.deprecated && engine), Number(engine), Number(!item.deprecated)];
  };
  const compare = (first: PackumentVersion, second: PackumentVersion) => {
    const firstRank = rank(first);
    const secondRank = rank(second);
    for (const [index, value] of secondRank.entries()) {
      const difference = value - (firstRank[index] ?? 0);
      if (difference !== 0) {
        return difference;
      }
    }
    return rcompare(first.version, second.version, LOOSE);
  };
  const best = packument.versions
    .filter((item) => satisfies(item.version, entry.spec, LOOSE))
    .sort(compare)
    .at(0);
  return best?.version;
}

// The registry stores versions without build metadata, while an installed manifest can keep it, as in `1.2.3+build`.
const comparableVersion = (version: string) => valid(version, LOOSE) ?? version;

const directoryNames = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
};

const manifestVersion = (text: string): string | undefined => {
  const manifest: unknown = JSON.parse(text);
  if (typeof manifest !== 'object' || manifest === null || !('version' in manifest)) {
    return undefined;
  }
  return typeof manifest.version === 'string' ? manifest.version : undefined;
};

const manifestPath = (directory: string, name: string) => join(directory, 'node_modules', name, 'package.json');

const installedVersion = async (directory: string, name: string): Promise<string | undefined> => {
  try {
    return manifestVersion(await readFile(manifestPath(directory, name), 'utf8'));
  } catch {
    return undefined;
  }
};

export async function listCachedPackages(packagesDirectory: string): Promise<CachedPackage[]> {
  const entries: string[] = [];
  for (const name of await directoryNames(packagesDirectory)) {
    if (name.startsWith('.')) {
      continue;
    }
    if (!name.startsWith('@')) {
      entries.push(name);
      continue;
    }
    for (const scoped of await directoryNames(join(packagesDirectory, name))) {
      entries.push(`${name}/${scoped}`);
    }
  }
  const packages = await Promise.all(
    entries.map(async (entry) => {
      const parsed = parseCacheEntry(entry);
      if (parsed === undefined) {
        return undefined;
      }
      const directory = join(packagesDirectory, ...entry.split('/'));
      const version = await installedVersion(directory, parsed.name);
      return version === undefined ? undefined : { ...parsed, entry, directory, installedVersion: version };
    }),
  );
  return packages.filter((cached) => cached !== undefined);
}

// The state file records, per cache entry, the version it was removed for. If the reinstall still does not
// produce that version, the registry Kilo installs from differs from the one checked here, and removing the
// entry again would only reinstall the same version at every start.
const readState = (packagesDirectory: string): Record<string, string> => {
  try {
    const state: unknown = JSON.parse(readFileSync(join(packagesDirectory, STATE_FILE), 'utf8'));
    if (typeof state !== 'object' || state === null) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(state).filter((item): item is [string, string] => typeof item[1] === 'string'),
    );
  } catch {
    return {};
  }
};

export async function findOutdatedPackages(options: FindOptions): Promise<OutdatedPackage[]> {
  await rm(join(options.packagesDirectory, STALE_DIRECTORY), { recursive: true, force: true });
  const removedFor = readState(options.packagesDirectory);
  const cached = await listCachedPackages(options.packagesDirectory);
  const packuments = new Map<string, ReturnType<PackumentLookup>>();
  const results = await Promise.all(
    cached.map(async (entry): Promise<OutdatedPackage | undefined> => {
      let packument = packuments.get(entry.name);
      if (packument === undefined) {
        packument = options.fetchPackument(entry.name);
        packuments.set(entry.name, packument);
      }
      try {
        const resolved = await packument;
        const availableVersion = resolved === undefined ? undefined : resolveSpec(resolved, entry);
        if (availableVersion === undefined || availableVersion === comparableVersion(entry.installedVersion)) {
          return undefined;
        }
        if (removedFor[entry.entry] === availableVersion) {
          await options.warn('Reinstalling the cached plugin package did not produce the registry version', {
            package: `${entry.name}@${entry.spec}`,
            installed: entry.installedVersion,
            registry: availableVersion,
          });
          return undefined;
        }
        return { ...entry, availableVersion };
      } catch (error) {
        await options.warn('Could not check cached plugin package', {
          package: `${entry.name}@${entry.spec}`,
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    }),
  );
  return results.filter((result) => result !== undefined);
}

// An entry is skipped when its installed version has changed since the check, because another process may have
// reinstalled it already. The directory is renamed before it is deleted: Kilo treats any existing
// `node_modules/<name>` as a complete install, so a recursive delete that stopped partway would leave a broken package
// that is never reinstalled. An entry that cannot be renamed stays in place and is checked again at the next start.
export function discardPackages(packagesDirectory: string, packages: readonly OutdatedPackage[]): string[] {
  const discarded: string[] = [];
  const state = readState(packagesDirectory);
  for (const entry of packages) {
    try {
      if (manifestVersion(readFileSync(manifestPath(entry.directory, entry.name), 'utf8')) !== entry.installedVersion) {
        continue;
      }
      const staleRoot = join(packagesDirectory, STALE_DIRECTORY);
      mkdirSync(staleRoot, { recursive: true });
      const staleDirectory = join(staleRoot, randomUUID());
      renameSync(entry.directory, staleDirectory);
      discarded.push(entry.entry);
      state[entry.entry] = entry.availableVersion;
      rmSync(staleDirectory, { recursive: true, force: true });
    } catch {
      // The entry stays in place; see the function comment.
    }
  }
  if (discarded.length > 0) {
    try {
      writeFileSync(join(packagesDirectory, STATE_FILE), JSON.stringify(state));
    } catch {
      // The removals stand. Without the record, a reinstall that still differs is removed once more.
    }
  }
  return discarded;
}

export function registryPackument(settings: NpmSettings): PackumentLookup {
  return async (name) => {
    const scope = name.startsWith('@') ? name.slice(0, name.indexOf('/')) : undefined;
    const configured = (scope === undefined ? undefined : settings.scopes[scope]) ?? settings.registry;
    // npm accepts credentials inside the registry URL. They are moved to the header so that request errors, which
    // can include the URL, do not expose them in logs.
    let url: URL;
    try {
      url = new URL(`${configured}/`);
    } catch {
      // The parse error can include the URL and any credentials in it, so it is not passed on.
      throw new Error('The configured registry URL is not valid');
    }
    const urlAuthorization =
      url.username === ''
        ? undefined
        : `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`;
    url.username = '';
    url.password = '';
    const registry = trimRegistry(url.href);
    const authorization = registryAuthorization(settings, registry) ?? urlAuthorization;
    const response = await fetch(`${registry}/${name.replaceAll('/', '%2f')}`, {
      headers: {
        accept: 'application/vnd.npm.install-v1+json',
        ...(authorization === undefined ? {} : { authorization }),
      },
      // A redirect would need its own credential check, so it is treated like any other unusable response.
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return undefined;
    }
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('dist-tags' in body)) {
      return undefined;
    }
    const tags = body['dist-tags'];
    if (typeof tags !== 'object' || tags === null) {
      return undefined;
    }
    const versions =
      'versions' in body && typeof body.versions === 'object' && body.versions !== null ? body.versions : {};
    return {
      distTags: Object.fromEntries(
        Object.entries(tags).filter((tag): tag is [string, string] => typeof tag[1] === 'string'),
      ),
      versions: Object.entries(versions).map(([version, manifest]: [string, unknown]) => {
        const fields = typeof manifest === 'object' && manifest !== null ? manifest : {};
        const deprecated = 'deprecated' in fields && typeof fields.deprecated === 'string' && fields.deprecated !== '';
        const engines = 'engines' in fields && typeof fields.engines === 'object' ? fields.engines : null;
        const node =
          engines !== null && 'node' in engines && typeof engines.node === 'string' ? engines.node : undefined;
        return { version, deprecated, ...(node === undefined ? {} : { node }) };
      }),
    };
  };
}
