// semver publishes no type declarations. These cover the functions the plugin cache refresh uses.
declare module 'semver' {
  export interface Options {
    loose?: boolean;
    includePrerelease?: boolean;
  }
  export function valid(version: string, options?: Options): string | null;
  export function validRange(range: string, options?: Options): string | null;
  export function satisfies(version: string, range: string, options?: Options): boolean;
  export function rcompare(first: string, second: string, options?: Options): number;
}
