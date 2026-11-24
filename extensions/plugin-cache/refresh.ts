import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
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
  readonly scopes: Readonly<Partial<Record<string, string>>>;
  // Authorization header values by registry "nerf dart", the `//host/path/` form npmrc credential keys use.
  readonly credentials: Readonly<Partial<Record<string, string>>>;
}

export function defaultPackagesDirectory(env: NodeJS.ProcessEnv = process.env): string {
  // xdg-basedir, which Kilo uses, treats an empty XDG_CACHE_HOME as unset. Kilo also removes newline characters.
  const cacheHome =
    env.XDG_CACHE_HOME === undefined || env.XDG_CACHE_HOME === '' ? join(homedir(), '.cache') : env.XDG_CACHE_HOME;
  return join(cacheHome.replace(/[\r\n]+/g, ''), 'kilo', 'packages');
}

const trimRegistry = (registry: string) => registry.replace(/\/+$/, '');

export function nerfDart(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
    return `//${parsed.host}${path}`;
  } catch {
    return undefined;
  }
}

const CREDENTIAL_KEY = /^(\/\/.+\/):(_authToken|_auth)$/;

// Reads `registry`, `@scope:registry`, and per-registry `_authToken` or `_auth` from an npmrc. `${VAR}` references
// are expanded as npm does. Other keys are ignored, and credentials are only sent to the registry they belong to.
export function parseNpmrc(text: string, env: NodeJS.ProcessEnv = process.env): NpmSettings {
  let registry = DEFAULT_REGISTRY;
  const scopes: Record<string, string> = {};
  const credentials: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const separator = line.indexOf('=');
    if (line.startsWith('#') || line.startsWith(';') || separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2')
      .replace(/\$\{([^}]+)\}/g, (_match, name: string) => env[name] ?? '');
    const credential = CREDENTIAL_KEY.exec(key);
    if (value === '') {
      continue;
    } else if (key === 'registry') {
      registry = trimRegistry(value);
    } else if (/^@[^:]+:registry$/.test(key)) {
      scopes[key.slice(0, key.indexOf(':'))] = trimRegistry(value);
    } else if (credential !== null) {
      const [, dart, field] = credential;
      credentials[dart] = field === '_authToken' ? `Bearer ${value}` : `Basic ${value}`;
    }
  }
  return { registry, scopes, credentials };
}

// These machines configure npm in the user's `~/.npmrc`, the same file Kilo's installer reads.
export function npmSettings(home: string = homedir()): NpmSettings {
  try {
    return parseNpmrc(readFileSync(join(home, '.npmrc'), 'utf8'));
  } catch {
    return parseNpmrc('');
  }
}

// Like npm, this walks from the registry URL up through its parent paths on the same host.
export function registryAuthorization(settings: NpmSettings, registry: string): string | undefined {
  let dart = nerfDart(registry);
  while (dart !== undefined) {
    const authorization = settings.credentials[dart];
    if (authorization !== undefined) {
      return authorization;
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

export async function findOutdatedPackages(options: FindOptions): Promise<OutdatedPackage[]> {
  await rm(join(options.packagesDirectory, STALE_DIRECTORY), { recursive: true, force: true });
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
// that is never reinstalled.
export function discardPackages(packagesDirectory: string, packages: readonly OutdatedPackage[]): string[] {
  const discarded: string[] = [];
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
      rmSync(staleDirectory, { recursive: true, force: true });
    } catch {
      // The entry stays in place and is checked again at the next start.
    }
  }
  return discarded;
}

export function registryPackument(settings: NpmSettings): PackumentLookup {
  return async (name) => {
    const scope = name.startsWith('@') ? name.slice(0, name.indexOf('/')) : undefined;
    const registry = (scope === undefined ? undefined : settings.scopes[scope]) ?? settings.registry;
    const authorization = registryAuthorization(settings, registry);
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
