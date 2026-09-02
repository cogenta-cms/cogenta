import process from 'node:process'
import { createVectorRegistry } from '@cogenta/agents'
import { PREVIEW_SIGNING_KEY_ENV, PREVIEW_SIGNING_KEY_MINIMUM_LENGTH } from '@cogenta/api'
import {
  type CogentaConfig,
  createCacheRegistry,
  createDatabaseRegistry,
  createLogger,
  createRateLimitRegistry,
  createStorageRegistry,
  type DatabaseHandle,
  type DriverSelection,
  type DriverSelectionReason,
  type DriverTier,
  isCogentaError,
  type Logger,
  loadConfig,
  type SkipReasonCode,
} from '@cogenta/core'
import { createImageRegistry } from '@cogenta/render'
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
    /** Runs after the selection is disposed — for a check that opened a resource of its own to make the selection (the `vector` check below, which needs a real database connection for the `pgvector` driver). */
    cleanup?: () => Promise<void>,
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
      await cleanup?.()
    }
  }

  await check('database', () => createDatabaseRegistry(registryOptions).select(config.database))
  await check('cache', () => createCacheRegistry(registryOptions).select(config.cache))
  await check('storage', () => createStorageRegistry(registryOptions).select(config.storage))
  // Audit fiche 05, T06 (R1/skill `new-driver`'s "doctor reporting"
  // requirement): the image pipeline's driver (sharp vs the WebAssembly
  // fallback) never appeared in `cogenta doctor`, unlike every other need
  // above — an operator on a host where `sharp` cannot install had no way
  // to learn that short of a slow first upload. `select({})` mirrors the
  // real call site (`media-images.ts`'s own `buildImageProcessing`): no
  // config section exists for this need, only tier order.
  await check('images', () => createImageRegistry(registryOptions).select({}))
  // Audit fiche 15, T05: `vector` (L18, semantic search) was never checked
  // either, so a misconfigured `vector.driver: 'pgvector'` was only
  // discovered the first time the assistant actually needed it. Unlike the
  // needs above, `pgvector` requires a real database connection — this
  // check opens its own (never the one `database` above already disposed
  // by the time this runs) and closes it via `cleanup`, after `check()`
  // has read everything it needs from the selection's `health()`.
  // `config.embeddings.dimensions` always has a default (384), so this can
  // run unconditionally — a vector need exists whether or not a real
  // embedding provider is configured (R2: the degraded `memory`/`file`
  // drivers work with zero AI configured too).
  let vectorDb: DriverSelection<DatabaseHandle> | undefined
  await check(
    'vector',
    async () => {
      vectorDb = await createDatabaseRegistry(registryOptions).select(config.database)
      return createVectorRegistry({
        db: vectorDb.instance,
        ...(registryOptions.logger === undefined ? {} : { logger: registryOptions.logger }),
      }).select({
        driver: config.vector.driver,
        dimensions: config.embeddings.dimensions,
        path: config.vector.path,
        table: config.vector.table,
      })
    },
    async () => {
      await vectorDb?.dispose()
    },
  )
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

  // Audit fiche 15, T05: image generation (L18 task 4) is a *note*, not a
  // `check()` — `createImageProviderRegistry` (`@cogenta/agents`) has no
  // driver-tier/health concept the way `database`/`cache`/`vector` do (no
  // service-free way to draw a picture, R2's whole reason this is an
  // optional section with no default provider at all) — so, like the LLM
  // note above, this only reports what is configured rather than treating
  // its absence as a problem `cogenta doctor` should ever flag.
  if (config.imageGeneration !== undefined) {
    notes.push(
      `Image-generation provider: ${config.imageGeneration.provider} (${config.imageGeneration.model}).` +
        (config.imageGeneration.apiKey === undefined
          ? ' No API key in the environment, so image generation will not run.'
          : ''),
    )
  }

  if (config.database.driver === 'sqlite') {
    notes.push('SQLite: one machine, no vector index. Fine for a single site, not for a fleet.')
  }

  if (config.storage.driver !== 's3' && env['COGENTA_STORAGE_SIGNING_KEY'] === undefined) {
    notes.push(
      'COGENTA_STORAGE_SIGNING_KEY is not set, so signed media URLs stop working after a restart.',
    )
  }

  // Fiche 40 task 4: a proactive check, not a reactive fix — the same
  // `CONFIG_INVALID` an editor's first "Prévisualiser" click threw
  // (`preview-token.ts`) is surfaced here before anyone clicks anything. Only
  // used if a draft is ever previewed (`withPreview`, `packages/api/src/rest/router.ts`),
  // so this stays a warning: a site that never uses preview links is not
  // broken by not having this key, and `doctor` must never fail a site over
  // an optional feature (AGENTS.md's own instruction — a warning, never a
  // blocking failure).
  const previewSigningKey = env[PREVIEW_SIGNING_KEY_ENV]
  if (
    previewSigningKey === undefined ||
    previewSigningKey.length < PREVIEW_SIGNING_KEY_MINIMUM_LENGTH
  ) {
    notes.push(
      `${PREVIEW_SIGNING_KEY_ENV} is missing or shorter than ${PREVIEW_SIGNING_KEY_MINIMUM_LENGTH} characters, so previewing an unpublished draft will fail. ` +
        `Set it in the environment — for example \`openssl rand -hex 32\`. Never put it in a configuration file.`,
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
