import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { CogentaError, type Logger } from '@cogenta/core'
import { checkForUpdates, type PackageUpdateStatus, type UpdateCheckReport } from './check.js'
import { createUpdateRestorePoint, type UpdateRestorePoint } from './restore-point.js'

/**
 * "Mise à jour en un clic depuis l'admin (ou `cogenta update` en CLI) — avec
 * un point de restauration obligatoire avant toute mise à jour... jamais une
 * mise à jour sans filet" (L22 task 9, point 2).
 *
 * The order is deliberate: a package whose update the caller has not
 * confirmed yet (because `check()` found a contract-risk warning) is refused
 * with `kind: 'confirmation-required'` **before** anything is backed up or
 * installed — there is nothing to protect yet. Once every risky package is
 * confirmed, the restore point is created unconditionally, and only then
 * does `npm install` run. If the backup step itself fails, this throws
 * (`UPDATE_RESTORE_POINT_FAILED`, from `restore-point.ts`) and nothing is
 * installed — a failed safety net cancels the update, it never becomes a
 * warning that gets ignored.
 */

const execFileAsync = promisify(execFile)

export interface RunPackageInstallInput {
  readonly cwd: string
  /** `@cogenta/core@0.5.0`-shaped specs — one target version per package, pinned exactly (`--save-exact`). */
  readonly specs: readonly string[]
}

export interface RunPackageInstallResult {
  readonly stdout: string
  readonly stderr: string
}

export type RunPackageInstall = (input: RunPackageInstallInput) => Promise<RunPackageInstallResult>

const MAX_INSTALL_OUTPUT_BYTES = 10 * 1024 * 1024

/** Real `npm install --save-exact <specs>`, run in the site's own directory. */
export const runNpmInstall: RunPackageInstall = async ({ cwd, specs }) => {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  try {
    const result = await execFileAsync(npmCommand, ['install', '--save-exact', ...specs], {
      cwd,
      maxBuffer: MAX_INSTALL_OUTPUT_BYTES,
    })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const withOutput = error as { stdout?: string; stderr?: string; message: string }
    throw new CogentaError({
      code: 'UPDATE_APPLY_FAILED',
      message: `npm install failed: ${withOutput.message}`,
      hint: 'The restore point taken just before this was not touched — restore it with "cogenta restore apply" if the site is now in a broken state, or fix the underlying npm error (check network access and the npm registry) and try again.',
      cause: error,
      details: { stdout: withOutput.stdout, stderr: withOutput.stderr },
    })
  }
}

export type ApplyUpdateResult =
  | { readonly kind: 'up-to-date'; readonly report: UpdateCheckReport }
  | {
      readonly kind: 'confirmation-required'
      readonly report: UpdateCheckReport
      readonly risky: readonly PackageUpdateStatus[]
    }
  | {
      readonly kind: 'applied'
      readonly report: UpdateCheckReport
      readonly restorePoint: UpdateRestorePoint
      readonly installed: readonly { readonly name: string; readonly version: string }[]
      readonly installOutput: RunPackageInstallResult
    }

export interface ApplyUpdateInput {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly packages: readonly { readonly name: string; readonly installed: string }[]
  /**
   * Required once `check()` has flagged a contract-risk warning for any
   * package in scope — the human-in-the-loop half of point 4 ("proposer
   * d'annuler"). Absent or `false` with a warning present refuses before
   * touching anything, `kind: 'confirmation-required'`.
   */
  readonly confirmBreakingChange?: boolean
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
  readonly backupDir?: string
  readonly runInstall?: RunPackageInstall
}

export async function applyUpdate(input: ApplyUpdateInput): Promise<ApplyUpdateResult> {
  const report = await checkForUpdates({
    packages: input.packages,
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    ...(input.now === undefined ? {} : { now: input.now }),
  })

  const updatable = report.packages.filter(
    (pkg): pkg is PackageUpdateStatus & { latest: string } =>
      pkg.updateAvailable && pkg.latest !== null,
  )
  if (updatable.length === 0) return { kind: 'up-to-date', report }

  const risky = updatable.filter((pkg) => (pkg.contractRisk?.warnings.length ?? 0) > 0)
  if (risky.length > 0 && input.confirmBreakingChange !== true) {
    return { kind: 'confirmation-required', report, risky }
  }

  // The safety net, unconditional, before anything else changes.
  const restorePoint = await createUpdateRestorePoint({
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.logger === undefined ? {} : { logger: input.logger }),
    ...(input.backupDir === undefined ? {} : { dir: input.backupDir }),
  })

  const cwd = input.cwd ?? process.cwd()
  const runInstall = input.runInstall ?? runNpmInstall
  const specs = updatable.map((pkg) => `${pkg.name}@${pkg.latest}`)
  const installOutput = await runInstall({ cwd, specs })

  return {
    kind: 'applied',
    report,
    restorePoint,
    installed: updatable.map((pkg) => ({ name: pkg.name, version: pkg.latest })),
    installOutput,
  }
}
