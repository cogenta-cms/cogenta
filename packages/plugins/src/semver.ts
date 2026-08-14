/**
 * A small, real semver-range matcher scoped to exactly the range shapes
 * `manifest.ts`'s `SEMVER_RANGE_PATTERN` already accepts: `^1.2.3`,
 * `~1.2.3`, a bare exact `1.2.3`, and a space-separated list of comparators
 * (`>=1.0.0 <2.0.0`). No `semver` dependency (R9) — this is the whole
 * matcher a plugin's `engine` field realistically needs, not a general
 * semver library.
 */

export interface SemverVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)/

export function parseVersion(input: string): SemverVersion | null {
  const match = VERSION_PATTERN.exec(input)
  if (match === null) return null
  const [, major, minor, patch] = match
  return { major: Number(major), minor: Number(minor), patch: Number(patch) }
}

/** -1 if `a < b`, 0 if equal, 1 if `a > b`. */
export function compareVersions(a: SemverVersion, b: SemverVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return 0
}

function satisfiesComparator(version: SemverVersion, comparator: string): boolean {
  const operatorMatch = /^(>=|<=|>|<|=)?(.+)$/.exec(comparator)
  if (operatorMatch === null) return false
  const [, operator = '=', rest = ''] = operatorMatch
  const target = parseVersion(rest)
  if (target === null) return false
  const cmp = compareVersions(version, target)

  switch (operator) {
    case '>=':
      return cmp >= 0
    case '<=':
      return cmp <= 0
    case '>':
      return cmp > 0
    case '<':
      return cmp < 0
    default:
      return cmp === 0
  }
}

/**
 * `^1.2.3` — compatible within the same major (or, per npm's own carat
 * semantics for a `0.x` line, the same minor when major is 0, and the same
 * patch when major and minor are both 0).
 */
function satisfiesCaret(version: SemverVersion, base: SemverVersion): boolean {
  if (compareVersions(version, base) < 0) return false
  if (base.major > 0) return version.major === base.major
  if (base.minor > 0) return version.major === 0 && version.minor === base.minor
  return version.major === 0 && version.minor === 0 && version.patch === base.patch
}

/** `~1.2.3` — compatible within the same major.minor. */
function satisfiesTilde(version: SemverVersion, base: SemverVersion): boolean {
  if (compareVersions(version, base) < 0) return false
  return version.major === base.major && version.minor === base.minor
}

/**
 * Whether `versionString` satisfies `range`. Returns `false` (never throws)
 * for a range or version this matcher cannot parse — an unparseable engine
 * range already fails `manifest.ts`'s own validation before this is ever
 * called, so this is a defensive fallback, not the primary guard.
 */
export function satisfiesRange(versionString: string, range: string): boolean {
  const version = parseVersion(versionString)
  if (version === null) return false
  const trimmed = range.trim()

  if (trimmed.startsWith('^')) {
    const base = parseVersion(trimmed.slice(1))
    return base !== null && satisfiesCaret(version, base)
  }
  if (trimmed.startsWith('~')) {
    const base = parseVersion(trimmed.slice(1))
    return base !== null && satisfiesTilde(version, base)
  }
  // A bare version, or a space-separated list of comparators (each ANDed).
  return trimmed
    .split(/\s+/)
    .every((comparator) => comparator.length > 0 && satisfiesComparator(version, comparator))
}
