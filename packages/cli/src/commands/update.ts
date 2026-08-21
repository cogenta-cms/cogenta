import process from 'node:process'
import { classifyAuditActor, createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { createLogger, getCoreVersion, isCogentaError, type Logger } from '@cogenta/core'
import type { Output, Writer } from '../output.js'
import {
  type ApplyUpdateResult,
  applyUpdate,
  checkForUpdates,
  listRestorePoints,
  listUpdateHistory,
  type RunPackageInstall,
  recordUpdateHistory,
  UPDATE_APPLIED_ACTION,
  UPDATE_APPLY_FAILED_ACTION,
  UPDATE_CHECKED_ACTION,
  type UpdateCheckReport,
} from '../update/index.js'
import { getCliVersion } from '../version.js'
import { defaultBackupDir, openSite } from './backup.js'

/**
 * `cogenta update` (L22 task 9) — the CLI half of the same logic the admin
 * screen's "Update now" button calls (`@cogenta/api`'s `createUpdateRouter`,
 * wired in `serve.ts`). Both go through exactly `checkForUpdates`/
 * `applyUpdate` from `../update/index.js`, never a second implementation.
 */

export type UpdateSubcommand = 'check' | 'apply' | 'history'

export interface UpdateOptions {
  readonly subcommand: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  readonly confirmBreaking?: boolean
  readonly dir?: string
  readonly fetchImpl?: typeof fetch
  /** Test seam only — real `cogenta update apply` always uses the real `npm install`. */
  readonly runInstall?: RunPackageInstall
}

const UPDATE_USAGE = `Usage
  cogenta update check     Compare the installed version against npm
  cogenta update apply     Apply an available update (creates a restore point first)
  cogenta update history   Show past checks, applies and the restore points they took

Options
  --confirm-breaking       apply: proceed even though a contract-risk warning was found
  --dir <path>             Where restore points are written/read (default .cogenta/backups)
`

function installedPackages(): readonly { readonly name: string; readonly installed: string }[] {
  return [
    { name: '@cogenta/core', installed: getCoreVersion() },
    { name: '@cogenta/cli', installed: getCliVersion() },
  ]
}

function printReport(report: UpdateCheckReport, out: Output): void {
  out.heading('Update check')
  out.line(`Checked at ${report.checkedAt}`)
  for (const pkg of report.packages) {
    if (pkg.checkError !== undefined) {
      out.line(`${pkg.name}: installed ${pkg.installed} — could not check npm: ${pkg.checkError}`)
      continue
    }
    if (!pkg.updateAvailable) {
      out.line(`${pkg.name}: ${pkg.installed} — up to date`)
      continue
    }
    out.line(`${pkg.name}: ${pkg.installed} -> ${pkg.latest} (${pkg.bump})`)
    if (pkg.contractRisk === null) continue
    if (!pkg.contractRisk.available) {
      out.line(
        `  contract risk: could not be determined — ${pkg.contractRisk.reason ?? 'unknown reason'}`,
      )
      continue
    }
    if (pkg.contractRisk.warnings.length === 0) {
      out.line('  contract risk: none of the scanned changelog entries mention a frozen contract')
    } else {
      out.line(
        '  contract risk: possible — a scan of the changelog found a mention of a frozen contract (review before applying):',
      )
      for (const warning of pkg.contractRisk.warnings) {
        out.line(`    ${warning.version}: ${warning.excerpt}`)
      }
    }
  }
  if (!report.updateAvailable) out.line('Everything is up to date.')
}

async function withAuditLog<T>(
  options: { readonly cwd?: string; readonly env?: Record<string, string | undefined> },
  logger: Logger,
  run: (auditLog: ReturnType<typeof createAuditLog>) => Promise<T>,
): Promise<T> {
  const { db, dispose } = await openSite(options, logger)
  try {
    await ensureAuthTables(db)
    return await run(createAuditLog(db))
  } finally {
    await dispose()
  }
}

export async function runUpdate(options: UpdateOptions): Promise<number> {
  const { out, stderr } = options
  const logger = options.logger ?? createLogger({ level: 'silent' })
  const cwd = options.cwd ?? process.cwd()
  const dir = options.dir ?? defaultBackupDir(cwd)

  if (options.subcommand === undefined) {
    stderr(`cogenta update needs a subcommand.\n\n${UPDATE_USAGE}`)
    return 2
  }
  if (
    options.subcommand !== 'check' &&
    options.subcommand !== 'apply' &&
    options.subcommand !== 'history'
  ) {
    stderr(`Unknown subcommand "${options.subcommand}".\n\n${UPDATE_USAGE}`)
    return 2
  }

  try {
    if (options.subcommand === 'history') {
      const [history, restorePoints] = await withAuditLog(options, logger, async (auditLog) => [
        await listUpdateHistory(auditLog),
        await listRestorePoints(dir),
      ])
      out.heading('Update history')
      if (history.length === 0) out.line('No update has been checked or applied yet.')
      for (const entry of history) {
        const actor = entry.actorId ?? `(${classifyAuditActor(entry)})`
        out.line(`${entry.at}  ${entry.action}  by ${actor}`)
      }
      out.heading('Restore points')
      if (restorePoints.length === 0) out.line('No restore point exists yet.')
      for (const point of restorePoints) {
        out.line(
          `${point.createdAt}  ${point.path}  ${point.tables} tables, ${point.rows} rows${point.triggeredByUpdate ? '  (taken automatically before an update)' : ''}`,
        )
      }
      return 0
    }

    if (options.subcommand === 'check') {
      const report = await checkForUpdates({
        packages: installedPackages(),
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      })
      printReport(report, out)
      await withAuditLog(options, logger, (auditLog) =>
        recordUpdateHistory(auditLog, {
          actorId: null,
          actorRoles: ['admin'],
          action: UPDATE_CHECKED_ACTION,
          diff: {
            packages: report.packages.map((pkg) => ({
              name: pkg.name,
              installed: pkg.installed,
              latest: pkg.latest,
              bump: pkg.bump,
            })),
          },
        }),
      ).catch((error: unknown) => {
        logger.error('update history record failed', { error: String(error) })
      })
      return 0
    }

    // apply
    let result: ApplyUpdateResult
    try {
      result = await applyUpdate({
        cwd,
        ...(options.env === undefined ? {} : { env: options.env }),
        logger,
        packages: installedPackages(),
        confirmBreakingChange: options.confirmBreaking === true,
        backupDir: dir,
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        ...(options.runInstall === undefined ? {} : { runInstall: options.runInstall }),
      })
    } catch (error) {
      await withAuditLog(options, logger, (auditLog) =>
        recordUpdateHistory(auditLog, {
          actorId: null,
          actorRoles: ['admin'],
          action: UPDATE_APPLY_FAILED_ACTION,
          diff: { error: isCogentaError(error) ? error.message : String(error) },
        }),
      ).catch(() => undefined)
      throw error
    }

    if (result.kind === 'up-to-date') {
      out.heading('Nothing to update')
      out.line('Every checked package is already at the latest version.')
      return 0
    }

    if (result.kind === 'confirmation-required') {
      out.heading('Update refused — contract risk found')
      out.line(
        'The following packages have an update available whose changelog mentions a frozen contract. Review before proceeding:',
      )
      for (const pkg of result.risky) {
        out.line(`${pkg.name}: ${pkg.installed} -> ${pkg.latest}`)
        for (const warning of pkg.contractRisk?.warnings ?? []) {
          out.line(`  ${warning.version}: ${warning.excerpt}`)
        }
      }
      out.line('Re-run with --confirm-breaking once you have reviewed this, to proceed anyway.')
      return 1
    }

    out.heading('Update applied')
    out.line(`Restore point: ${result.restorePoint.path}`)
    for (const pkg of result.installed) out.line(`${pkg.name} -> ${pkg.version}`)
    out.line('Restart cogenta for the new version to take effect.')

    await withAuditLog(options, logger, (auditLog) =>
      recordUpdateHistory(auditLog, {
        actorId: null,
        actorRoles: ['admin'],
        action: UPDATE_APPLIED_ACTION,
        diff: {
          installed: result.installed,
          restorePoint: result.restorePoint.path,
        },
      }),
    ).catch((error: unknown) => {
      logger.error('update history record failed', { error: String(error) })
    })

    return 0
  } catch (error) {
    if (isCogentaError(error)) {
      stderr(`${error.code}: ${error.message}\n`)
      if (error.hint !== undefined) stderr(`${error.hint}\n`)
    } else {
      stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
    return 1
  }
}
