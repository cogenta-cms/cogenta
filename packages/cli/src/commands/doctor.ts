import process from 'node:process'
import {
  type CogentaConfig,
  createCacheRegistry,
  createDatabaseRegistry,
  createLogger,
  createRateLimitRegistry,
  createStorageRegistry,
  type DriverSelection,
  type DriverSelectionReason,
  type DriverTier,
  isCogentaError,
  type Logger,
  loadConfig,
  type SkipReasonCode,
} from '@cogenta/core'
import type { Output } from '../output.js'

export interface DoctorCheck {
  readonly need: string
  readonly status: 'ok' | 'degraded' | 'down'
  readonly driver: string
  readonly tier: DriverTier
  readonly reason: string
  /** Same information as `reason`, as a stable code a translated UI (the admin's "Santé" screen) can look up instead of showing English prose (L20 audit §1 point 12). */
  readonly reasonCode: DriverSelectionReason
  readonly message: string | undefined
  readonly skipped: readonly {
    driver: string
    tier: DriverTier
    reason: string
    reasonCode: SkipReasonCode
    detail?: string
  }[]
}

export interface DoctorReport {
  readonly node: string
  readonly platform: string
  readonly arch: string
  readonly configPath: string | null
  readonly site: { name: string; url: string; locales: readonly string[] } | undefined
  readonly checks: readonly DoctorCheck[]
  readonly notes: readonly string[]
  readonly problems: readonly string[]
}

export interface DoctorOptions {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
}

function describe(error: unknown): string {
  if (isCogentaError(error)) {
    return error.hint === undefined ? error.message : `${error.message}\n${error.hint}`
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Diagnoses an install: which driver is running for each need, why that one, and
 * what it costs.
 *
 * "Why" is not decoration. The registry can silently fall back from Redis to the
 * filesystem, and an operator who cannot see that has a site that is slower than
 * they think for a reason nothing told them.
 */
export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const env = options.env ?? process.env
  const checks: DoctorCheck[] = []
  const notes: string[] = []
  const problems: string[] = []

  const base = {
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  }

  let config: CogentaConfig
  let configPath: string | null = null

  try {
    const loaded = await loadConfig({
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env,
    })
    config = loaded.config
    configPath = loaded.path
  } catch (error) {
    return {
      ...base,
      configPath: null,
      site: undefined,
      checks: [],
      notes: [],
      problems: [describe(error)],
    }
  }

  if (configPath === null) {
    notes.push('No cogenta.config file found. The configuration came from the environment.')
  }

  // Silent unless the caller asks otherwise. A human report on stdout must not
  // be interleaved with NDJSON: piping doctor into a file should give something
  // a person can read, and `--verbose` sends the structured lines to stderr.
  const registryOptions = { logger: options.logger ?? createLogger({ level: 'silent' }) }

  /** Selects a driver and turns the outcome — success or failure — into a check. */
  const check = async (
    need: string,
    select: () => Promise<DriverSelection<unknown>>,
  ): Promise<void> => {
    let selection: DriverSelection<unknown> | undefined
    try {
      selection = await select()
      const health = await selection.health()

      checks.push({
        need,
        status: health.status,
        driver: selection.driver,
        tier: selection.tier,
        reason: selection.requested ? 'named in the configuration' : selection.reason,
        reasonCode: selection.reasonCode,
        message: health.message,
        skipped: selection.skipped,
      })
    } catch (error) {
      problems.push(`${need}: ${describe(error)}`)
    } finally {
      await selection?.dispose()
    }
  }

  await check('database', () => createDatabaseRegistry(registryOptions).select(config.database))
  await check('cache', () => createCacheRegistry(registryOptions).select(config.cache))
  await check('storage', () => createStorageRegistry(registryOptions).select(config.storage))
  // Per-API-key request quota (fiche 20 task 3) — "file de jobs : base de
  // données (dégradé), car Redis est absent" for this need too: an operator
  // must be able to see which counter is actually enforcing a key's limit.
  await check('rateLimit', () => createRateLimitRegistry(registryOptions).select(config.rateLimit))

  // Rule R2, stated out loud rather than left to be discovered: no provider is a
  // supported configuration, not a broken one.
  notes.push(
    config.llm === undefined
      ? 'No LLM provider configured. Everything works except the agents.'
      : `LLM provider: ${config.llm.provider} (${config.llm.model}).${
          config.llm.apiKey === undefined
            ? ' No API key in the environment, so the agents will not run.'
            : ''
        }`,
  )

  if (config.database.driver === 'sqlite') {
    notes.push('SQLite: one machine, no vector index. Fine for a single site, not for a fleet.')
  }

  if (config.storage.driver !== 's3' && env['COGENTA_STORAGE_SIGNING_KEY'] === undefined) {
    notes.push(
      'COGENTA_STORAGE_SIGNING_KEY is not set, so signed media URLs stop working after a restart.',
    )
  }

  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major !== undefined && minor !== undefined && (major < 22 || (major === 22 && minor < 13))) {
    problems.push(
      `Node ${process.versions.node} has no built-in SQLite. Upgrade to 22.13 or later, or use Postgres or MySQL.`,
    )
  }

  return {
    ...base,
    configPath,
    site: { name: config.site.name, url: config.site.url, locales: config.site.locales },
    checks,
    notes,
    problems,
  }
}

export function formatDoctorReport(report: DoctorReport, out: Output): void {
  out.heading('Environment')
  out.ok(`Node ${report.node} on ${report.platform} ${report.arch}`)
  out.ok(report.configPath ?? 'configuration from the environment')

  if (report.site !== undefined) {
    out.heading('Site')
    out.ok(`${report.site.name} — ${report.site.url}`)
    out.detail(`locales: ${report.site.locales.join(', ')}`)
  }

  if (report.checks.length > 0) {
    out.heading('Drivers')
    for (const item of report.checks) {
      const label = `${item.need}: ${item.driver} (${item.tier}) — ${item.reason}`

      if (item.status === 'ok') out.ok(label)
      else if (item.status === 'degraded') out.warn(label)
      else out.bad(label)

      if (item.message !== undefined) out.detail(item.message)
      for (const skipped of item.skipped) out.detail(`${skipped.driver}: ${skipped.reason}`)
    }
  }

  if (report.notes.length > 0) {
    out.heading('Notes')
    for (const note of report.notes) out.warn(note)
  }

  if (report.problems.length > 0) {
    out.heading('Problems')
    for (const problem of report.problems) out.bad(problem)
  }

  out.line()
  if (report.problems.length === 0) out.line('Nothing is broken.')
  else out.line(`${report.problems.length} problem(s) to fix.`)
}
