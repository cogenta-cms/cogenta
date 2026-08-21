import { assessContractRisk, type ContractRiskAssessment } from './contract-risk.js'
import { fetchNpmPackageSummary } from './npm-registry.js'
import { classifyBump, higherRiskBump, type UpdateBump } from './version-compare.js'

/**
 * `cogenta update check` / `GET /api/updates/status` (L22 task 9, point 1):
 * "compare la version installée à la dernière publiée sur npm —
 * `@cogenta/core` et `@cogenta/cli` sont déjà la source de vérité de
 * version."
 *
 * "Installed" here means each package's own self-reported version
 * (`getCoreVersion`/`getCliVersion`, both lazily computed with
 * `readOwnPackageVersion` in `@cogenta/core` — see that function's own
 * comment for why this is never a top-level constant) — whichever
 * `@cogenta/core`/`@cogenta/cli` this very process actually
 * loaded, not a guess read from `node_modules` by path (which would answer
 * a different, less certain question on a hoisted or symlinked install).
 * Scoped to exactly these two packages, deliberately, not every `@cogenta/*`
 * dependency a site happens to carry (`@cogenta/theme-canonical`, any
 * installed plugin…) — see this module's caller for why.
 *
 * Point 4's contract-risk check ("avant d'appliquer : notifier le risque")
 * runs here too, not only inside `apply.ts` — an admin (or `cogenta update
 * check`) needs to see the risk *before* deciding to confirm, so `check()`
 * already fetches it for every package that actually has an update
 * available (never for one that does not — no reason to download a tarball
 * nobody would apply). `includeContractRisk: false` skips it for a caller
 * that only wants the fast version comparison.
 */

export interface PackageUpdateStatus {
  readonly name: string
  readonly installed: string
  /** `null` only when the registry check for this specific package failed — never when it simply reports no update. */
  readonly latest: string | null
  readonly bump: UpdateBump
  readonly updateAvailable: boolean
  /** Set only when `latest` is `null`. */
  readonly checkError: string | undefined
  /** `null` when there is no update to assess, or `includeContractRisk` was `false`. See `contract-risk.ts` for how honestly limited this signal is. */
  readonly contractRisk: ContractRiskAssessment | null
}

export interface UpdateCheckReport {
  readonly checkedAt: string
  readonly packages: readonly PackageUpdateStatus[]
  readonly updateAvailable: boolean
  readonly highestBump: UpdateBump
  /** `true` when any package's `contractRisk` actually found a warning — the one field a "should I click apply" UI decision boils down to. */
  readonly contractRiskDetected: boolean
}

export interface CheckForUpdatesInput {
  /** `{ name, installed }` for each package to check — `check.ts` itself has no opinion on which packages that is; `cogenta update`/`update-router.ts` pass `@cogenta/core`/`@cogenta/cli`. */
  readonly packages: readonly { readonly name: string; readonly installed: string }[]
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
  /** Default `true`. `false` skips the tarball fetch/scan entirely — a faster, network-lighter check with no risk signal. */
  readonly includeContractRisk?: boolean
}

export async function checkForUpdates(input: CheckForUpdatesInput): Promise<UpdateCheckReport> {
  const now = input.now ?? ((): Date => new Date())
  const fetchImpl = input.fetchImpl ?? fetch
  const includeContractRisk = input.includeContractRisk ?? true

  const packages: PackageUpdateStatus[] = []
  for (const { name, installed } of input.packages) {
    try {
      const summary = await fetchNpmPackageSummary(name, fetchImpl)
      const bump = classifyBump(installed, summary.latest)
      const updateAvailable = bump !== 'none' && bump !== 'unknown'

      let contractRisk: ContractRiskAssessment | null = null
      const tarballUrl = summary.tarballUrl[summary.latest]
      if (includeContractRisk && updateAvailable && tarballUrl !== undefined) {
        contractRisk = await assessContractRisk({
          packageName: name,
          fromVersion: installed,
          toVersion: summary.latest,
          tarballUrl,
          fetchImpl,
        })
      }

      packages.push({
        name,
        installed,
        latest: summary.latest,
        bump,
        updateAvailable,
        checkError: undefined,
        contractRisk,
      })
    } catch (error) {
      packages.push({
        name,
        installed,
        latest: null,
        bump: 'unknown',
        updateAvailable: false,
        checkError: error instanceof Error ? error.message : String(error),
        contractRisk: null,
      })
    }
  }

  const highestBump = packages.reduce<UpdateBump>(
    (highest, pkg) => higherRiskBump(highest, pkg.bump === 'unknown' ? 'none' : pkg.bump),
    'none',
  )

  return {
    checkedAt: now().toISOString(),
    packages,
    updateAvailable: packages.some((pkg) => pkg.updateAvailable),
    highestBump,
    contractRiskDetected: packages.some((pkg) => (pkg.contractRisk?.warnings.length ?? 0) > 0),
  }
}
