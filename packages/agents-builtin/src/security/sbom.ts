export interface SbomEntry {
  readonly name: string
  readonly version: string
  /** OSV's ecosystem identifier (e.g. `npm`) — https://ossf.github.io/osv-schema/#affectedpackage-field */
  readonly ecosystem: string
}

/**
 * `dependencies` must already be resolved, exact versions (from a lockfile),
 * not the semver ranges a `package.json` declares — OSV's query API matches
 * one concrete version, not a range, and resolving a range to what is
 * actually installed is the caller's job (reading the lockfile), not this
 * pure function's.
 */
export function buildSbom(
  dependencies: Readonly<Record<string, string>>,
  ecosystem = 'npm',
): readonly SbomEntry[] {
  return Object.entries(dependencies).map(([name, version]) => ({ name, version, ecosystem }))
}
