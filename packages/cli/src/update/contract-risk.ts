import { CogentaError } from '@cogenta/core'
import { compareVersions, parseVersion } from '@cogenta/plugins'
import {
  type ContractRiskWarning,
  sectionsMentioningContractRisk,
  splitChangelogSections,
} from './changelog-risk.js'
import { findPackageFile, readTarGz } from './tar.js'

/**
 * "Avant d'appliquer : notifier le risque si la mise à jour touche un
 * contrat A/B/C/D/E" (L22 task 9, point 4) — read honestly, this is the
 * hardest, least reliable part of the whole feature, and this module is
 * built to be honest about that rather than to overclaim.
 *
 * **What is actually detectable, and since when.** A changeset's own prose
 * lives in `.changeset/*.md` only until a release consumes it into the
 * publishing package's `CHANGELOG.md` — after that, the `.changeset` file is
 * deleted and `CHANGELOG.md` is the only surviving copy. Nothing about that
 * text is ever sent to npm's registry API itself (no "breaking: true" field
 * exists on a package version there); the only way to read it from an
 * installed site, with no access to this repository's own git history, is to
 * fetch the target version's own **published tarball** and read
 * `CHANGELOG.md` out of it directly — which is exactly what this module does
 * (`tar.ts`'s minimal reader, over `dist.tarball` from the npm registry,
 * never a third-party CDN).
 *
 * **The one honest catch.** Before this task, `@cogenta/core` and
 * `@cogenta/cli`'s `package.json` `"files"` was `["dist"]` — `CHANGELOG.md`
 * was never actually included in the published npm tarball at all (verified
 * with a real `npm pack` during this task). This task adds it to `"files"`
 * for both packages, but that only takes effect for versions published
 * **from now on**. Every version already on npm when this ships (`0.1.x`
 * through `0.4.0` at the time of writing) has no `CHANGELOG.md` in its
 * tarball, so this reports `available: false` for those, honestly, rather
 * than inventing a "no risk found" that would really mean "could not look."
 *
 * **Even once it can read a CHANGELOG.md, this is a keyword scan of prose,
 * not a structured signal** (`changelog-risk.ts`'s `FROZEN_CONTRACT_PATTERN`)
 * — deliberately broad, so it can miss an unusually-worded note and it can
 * also flag one that turns out to be harmless. It is a strong hint an admin
 * reviews before confirming, never a guarantee, and the UI/CLI say so.
 */

export interface ContractRiskAssessment {
  readonly packageName: string
  /** `false` when no CHANGELOG.md could be read for the target version at all — an honest "could not determine," never treated as "no risk." */
  readonly available: boolean
  readonly reason: string | undefined
  /** Every version between the installed one (exclusive) and the target (inclusive) whose changelog section this could actually read. */
  readonly scannedVersions: readonly string[]
  readonly warnings: readonly ContractRiskWarning[]
}

const MAX_TARBALL_BYTES = 20 * 1024 * 1024

function unavailable(packageName: string, reason: string): ContractRiskAssessment {
  return { packageName, available: false, reason, scannedVersions: [], warnings: [] }
}

export interface AssessContractRiskInput {
  readonly packageName: string
  readonly fromVersion: string
  readonly toVersion: string
  readonly tarballUrl: string
  readonly fetchImpl?: typeof fetch
}

export async function assessContractRisk(
  input: AssessContractRiskInput,
): Promise<ContractRiskAssessment> {
  const { packageName, fromVersion, toVersion, tarballUrl } = input
  const fetchImpl = input.fetchImpl ?? fetch

  let response: Response
  try {
    response = await fetchImpl(tarballUrl, { signal: AbortSignal.timeout(15_000) })
  } catch (error) {
    return unavailable(packageName, `could not download the package tarball: ${String(error)}`)
  }
  if (!response.ok) {
    return unavailable(packageName, `the package tarball responded with HTTP ${response.status}`)
  }

  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > MAX_TARBALL_BYTES) {
    return unavailable(packageName, 'the package tarball is larger than this check accepts')
  }

  let bytes: ArrayBuffer
  try {
    bytes = await response.arrayBuffer()
  } catch (error) {
    return unavailable(packageName, `could not read the package tarball: ${String(error)}`)
  }
  if (bytes.byteLength > MAX_TARBALL_BYTES) {
    return unavailable(packageName, 'the package tarball is larger than this check accepts')
  }

  let changelog: Buffer | null
  try {
    const entries = readTarGz(Buffer.from(bytes))
    changelog = findPackageFile(entries, 'CHANGELOG.md')
  } catch (error) {
    return unavailable(packageName, `could not read the package tarball: ${String(error)}`)
  }
  if (changelog === null) {
    return unavailable(packageName, 'this version carries no CHANGELOG.md in its published tarball')
  }

  const sections = splitChangelogSections(changelog.toString('utf8'))
  const inRange = sections.filter((section) => isInRange(section.version, fromVersion, toVersion))
  const warnings = sectionsMentioningContractRisk(inRange)

  return {
    packageName,
    available: true,
    reason: undefined,
    scannedVersions: inRange.map((section) => section.version),
    warnings,
  }
}

/** `fromVersion < version <= toVersion`, via `@cogenta/plugins`'s own comparator — unparseable versions (a pre-release tag this parser does not understand) are excluded rather than guessed at. */
function isInRange(version: string, fromVersion: string, toVersion: string): boolean {
  const v = parseVersion(version)
  const from = parseVersion(fromVersion)
  const to = parseVersion(toVersion)
  if (v === null || from === null || to === null) return false
  return compareVersions(v, from) > 0 && compareVersions(v, to) <= 0
}

export function contractRiskUnknownError(packageName: string, reason: string): CogentaError {
  return new CogentaError({
    code: 'UPDATE_CHECK_FAILED',
    message: `Could not determine whether updating "${packageName}" touches a frozen contract: ${reason}`,
    hint: 'Review the target version manually before applying, or retry once network access to registry.npmjs.org is available.',
    details: { packageName, reason },
  })
}
