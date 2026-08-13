/**
 * The three-number subset of semver a block version uses.
 *
 * Written here rather than pulled in: a comparison of three integers does not
 * justify a dependency (rule R9), and block versions are produced by this
 * project only, so pre-release and build metadata never appear.
 */

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function isBlockVersion(value: string): boolean {
  return VERSION.test(value)
}

/** `-1`, `0` or `1`. Throws nothing: callers validate the strings first. */
export function compareBlockVersions(a: string, b: string): number {
  const left = a.split('.')
  const right = b.split('.')
  for (let i = 0; i < 3; i += 1) {
    const diff = Number(left[i] ?? 0) - Number(right[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}
