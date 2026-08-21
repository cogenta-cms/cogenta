import { compareVersions, parseVersion } from '@cogenta/plugins'

/**
 * Classifies the difference between two real version strings. Built on
 * `@cogenta/plugins`'s own `parseVersion`/`compareVersions` (the semver
 * comparator L8's fleet package already reuses for its own version-drift
 * detection) rather than a second implementation, and rather than a new
 * `semver` dependency (R9) — `@cogenta/cli` already depends on
 * `@cogenta/plugins`.
 */
export type UpdateBump = 'none' | 'patch' | 'minor' | 'major' | 'unknown'

export function classifyBump(from: string, to: string): UpdateBump {
  const fromVersion = parseVersion(from)
  const toVersion = parseVersion(to)
  if (fromVersion === null || toVersion === null) return 'unknown'

  const cmp = compareVersions(toVersion, fromVersion)
  if (cmp <= 0) return 'none'
  if (toVersion.major !== fromVersion.major) return 'major'
  if (toVersion.minor !== fromVersion.minor) return 'minor'
  return 'patch'
}

/** Every closed choice `updates.autoUpdatePolicy` (the site-settings registry entry) may hold. */
export const AUTO_UPDATE_POLICIES = ['off', 'patch', 'patch-minor', 'patch-minor-major'] as const
export type AutoUpdatePolicy = (typeof AUTO_UPDATE_POLICIES)[number]

/** Whether `bump` is one this policy allows to apply unattended. `'unknown'` and `'none'` are never allowed — nothing to apply, or nothing safely comparable. */
export function policyAllows(policy: AutoUpdatePolicy, bump: UpdateBump): boolean {
  switch (policy) {
    case 'off':
      return false
    case 'patch':
      return bump === 'patch'
    case 'patch-minor':
      return bump === 'patch' || bump === 'minor'
    case 'patch-minor-major':
      return bump === 'patch' || bump === 'minor' || bump === 'major'
  }
}

/** The higher-risk of two bumps, `'unknown'` treated as higher risk than `'major'` since it means "could not tell". */
const BUMP_RANK: Readonly<Record<UpdateBump, number>> = {
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
  unknown: 4,
}

export function higherRiskBump(a: UpdateBump, b: UpdateBump): UpdateBump {
  return BUMP_RANK[a] >= BUMP_RANK[b] ? a : b
}
