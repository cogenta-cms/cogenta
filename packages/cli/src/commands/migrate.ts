import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  CogentaError,
  createDatabaseRegistry,
  createLogger,
  createMigrator,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
  type Migration,
  type MigrationOutcome,
  type MigrationStatus,
  type SqlExecutor,
} from '@cogenta/core'
import type { Output, Writer } from '../output.js'

/** The directory a project keeps its migrations in, relative to the config file. */
export const MIGRATIONS_DIRECTORY = 'migrations'

/**
 * Only ESM sources. `.cjs` is deliberately absent: Cogenta is ESM-only, and a
 * migration that needs a CommonJS loader would be the one place it leaked back
 * in. `.ts` works from Node 22.18, which strips types on import.
 */
const MIGRATION_EXTENSIONS = ['.js', '.mjs', '.ts', '.mts'] as const

export type MigrateSubcommand = 'status' | 'up' | 'down'

export interface MigrateOptions {
  readonly subcommand: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  /** Where the human-readable report goes. */
  readonly out: Output
  /** Where refusals and failures go, so a piped report stays clean. */
  readonly stderr: Writer
  readonly to?: string
  readonly steps?: number
  readonly confirmDestructive?: boolean
  readonly backupVerified?: boolean
  /** Overrides the `migrations/` directory next to the configuration file. */
  readonly directory?: string
}

const USAGE = `Usage
  cogenta migrate status                    List every migration and its state
  cogenta migrate up [--to <id>]            Apply the pending migrations
  cogenta migrate down [--steps <n>|--to <id>]  Revert applied migrations

Options
  --confirm-destructive   The impact of every destructive migration has been read
  --backup-verified       A backup was taken and verified to restore
`

/** A migration body, as loaded from a file we did not compile ourselves. */
type MigrationBody = (tx: SqlExecutor) => Promise<void>

function isBody(value: unknown): value is MigrationBody {
  return typeof value === 'function'
}

function invalidMigration(file: string, reason: string): CogentaError {
  return new CogentaError({
    code: 'MIGRATION_FAILED',
    message: `${file} is not a migration: ${reason}.`,
    hint: 'A migration file default-exports an object with an `up(tx)` and a `down(tx)`, both returning a promise. `down` is required — every migration is reversible.',
    details: { file },
  })
}

/**
 * Turns one loaded module into a `Migration`, refusing anything that only looks
 * like one.
 *
 * The id defaults to the file name without its extension, which is why files are
 * sorted by name: the on-disk order and the applied order are then the same
 * thing, and there is no second ordering to keep in sync.
 */
function toMigration(exported: unknown, file: string, checksum: string): Migration {
  if (typeof exported !== 'object' || exported === null) {
    throw invalidMigration(file, 'its default export is not an object')
  }

  const record = exported as Record<string, unknown>
  const { up, down } = record

  if (!isBody(up)) throw invalidMigration(file, 'it has no `up` function')
  if (!isBody(down)) throw invalidMigration(file, 'it has no `down` function')

  const id = typeof record.id === 'string' ? record.id : file.replace(/\.[^.]+$/, '')
  const name = record.name
  const impact = record.impact
  const duration = record.estimatedDurationMs

  return {
    id,
    ...(typeof name === 'string' ? { name } : {}),
    // The file's own checksum wins over a declared one: the point is to detect a
    // file that changed after it was applied, and a hand-written checksum would
    // be edited along with the file it is supposed to guard.
    checksum,
    ...(record.destructive === true ? { destructive: true } : {}),
    ...(typeof impact === 'string' ? { impact } : {}),
    ...(typeof duration === 'number' ? { estimatedDurationMs: duration } : {}),
    up,
    down,
  }
}

/**
 * Loads every migration from a directory, in file-name order.
 *
 * A missing directory is not an error. L0 ships no business schema at all, so a
 * fresh project legitimately has nothing to migrate, and failing there would
 * make `migrate status` unusable exactly when an operator wants to check.
 */
export async function loadMigrations(directory: string): Promise<Migration[]> {
  let names: string[]
  try {
    names = await readdir(directory)
  } catch {
    return []
  }

  const files = names
    .filter(
      (name) =>
        !name.endsWith('.d.ts') && MIGRATION_EXTENSIONS.some((suffix) => name.endsWith(suffix)),
    )
    .sort((a, b) => a.localeCompare(b))

  const migrations: Migration[] = []
  for (const file of files) {
    const path = join(directory, file)
    // Hashing the source, not the exported object: it is the source that an
    // operator edits, and the engine refuses a migration whose hash moved after
    // it was applied.
    const checksum = createHash('sha256')
      .update(await readFile(path))
      .digest('hex')

    let module: { default?: unknown }
    try {
      module = (await import(pathToFileURL(path).href)) as { default?: unknown }
    } catch (error) {
      throw new CogentaError({
        code: 'MIGRATION_FAILED',
        message: `Could not load ${path}: ${error instanceof Error ? error.message : String(error)}`,
        hint: path.endsWith('.ts')
          ? 'A TypeScript migration needs a Node runtime that strips types, which means Node 22.18 or later. Rename it to .mjs on an older one.'
          : 'Check the file for a syntax error, and that every import it uses is installed.',
        cause: error,
        details: { path },
      })
    }

    migrations.push(toMigration(module.default, file, checksum))
  }

  return migrations
}

interface DestructiveDetail {
  readonly id: string
  readonly impact: string
}

/**
 * Reads back the destructive migrations the engine named when it refused.
 *
 * The refusal is only useful if the operator can see *what* would be lost, so
 * the details the engine attached are unpacked rather than summarised away.
 */
function destructiveDetails(error: CogentaError): DestructiveDetail[] {
  const listed: unknown = error.details?.migrations
  if (!Array.isArray(listed)) return []

  const entries: readonly unknown[] = listed
  return entries.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    const id = record.id
    const impact = record.impact
    if (typeof id !== 'string') return []
    return [{ id, impact: typeof impact === 'string' ? impact : 'not documented' }]
  })
}

function formatStatus(rows: readonly MigrationStatus[], out: Output): void {
  out.heading('Migrations')

  if (rows.length === 0) {
    out.warn('No migration found. Add files to the migrations/ directory of the project.')
    return
  }

  for (const row of rows) {
    const label = row.name === row.id ? row.id : `${row.id} — ${row.name}`

    if (!row.applied) {
      out.warn(`${label} — pending`)
    } else if (row.checksumMismatch) {
      out.bad(`${label} — applied ${row.appliedAt ?? 'at an unknown time'}, but changed since`)
    } else {
      out.ok(
        `${label} — applied ${row.appliedAt ?? 'at an unknown time'} (${row.durationMs ?? 0}ms)`,
      )
    }

    if (row.destructive) out.detail(`destructive: ${row.impact ?? 'impact not documented'}`)
    if (row.checksumMismatch) {
      out.detail('The file no longer matches what ran here. Write a new migration instead.')
    }
  }
}

function formatOutcomes(outcomes: readonly MigrationOutcome[], out: Output): void {
  for (const outcome of outcomes) {
    const verb = outcome.direction === 'up' ? 'applied' : 'reverted'
    out.ok(`${verb} ${outcome.id} (${outcome.durationMs}ms)`)
  }
}

/** Opens the database named by the configuration, exactly the way doctor does. */
async function withDatabase<T>(
  options: MigrateOptions,
  logger: Logger,
  use: (db: DatabaseHandle, projectRoot: string) => Promise<T>,
): Promise<T> {
  const env = options.env ?? process.env
  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })

  // Migrations belong to the project, so they sit next to its configuration
  // file — not next to whatever directory the command happened to be run from.
  const projectRoot =
    loaded.path === null ? resolvePath(options.cwd ?? process.cwd()) : dirname(loaded.path)

  const selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  try {
    return await use(selection.instance, projectRoot)
  } finally {
    await selection.dispose()
  }
}

/**
 * Runs one `migrate` subcommand and returns its exit code.
 *
 * 0 succeeded, 1 the database or a migration said no, 2 the command line was
 * wrong. Nothing calls `process.exit` and nothing writes to a stream directly,
 * so a test drives this exactly as a shell does.
 */
export async function runMigrate(options: MigrateOptions): Promise<number> {
  const { out, stderr } = options

  if (options.subcommand === undefined) {
    stderr(`cogenta migrate needs a subcommand.\n\n${USAGE}`)
    return 2
  }

  if (
    options.subcommand !== 'status' &&
    options.subcommand !== 'up' &&
    options.subcommand !== 'down'
  ) {
    stderr(`Unknown subcommand "${options.subcommand}".\n\n${USAGE}`)
    return 2
  }

  const subcommand: MigrateSubcommand = options.subcommand
  // Silent unless asked: a human report on stdout must not be interleaved with
  // NDJSON. `--verbose` sends the structured lines to stderr instead.
  const logger = options.logger ?? createLogger({ level: 'silent' })

  try {
    return await withDatabase(options, logger, async (db, projectRoot) => {
      const directory = options.directory ?? join(projectRoot, MIGRATIONS_DIRECTORY)
      const migrations = await loadMigrations(directory)
      const migrator = createMigrator({ db, migrations, logger })

      const run = {
        ...(options.to === undefined ? {} : { to: options.to }),
        ...(options.confirmDestructive === true ? { confirmDestructive: true } : {}),
        ...(options.backupVerified === true ? { backupVerified: true } : {}),
      }

      if (subcommand === 'status') {
        const rows = await migrator.status()
        formatStatus(rows, out)

        const pending = rows.filter((row) => !row.applied).length
        const drifted = rows.filter((row) => row.checksumMismatch).length

        out.line()
        out.line(`${rows.length - pending} applied, ${pending} pending.`)
        // A drifted checksum is a real fault, not a note: two environments ran
        // different SQL under the same id, and a deployment script must notice.
        return drifted === 0 ? 0 : 1
      }

      const outcomes =
        subcommand === 'up'
          ? await migrator.up(run)
          : await migrator.down({
              ...run,
              ...(options.steps === undefined ? {} : { steps: options.steps }),
            })

      out.heading(subcommand === 'up' ? 'Applied' : 'Reverted')
      formatOutcomes(outcomes, out)

      out.line()
      out.line(
        outcomes.length === 0
          ? subcommand === 'up'
            ? 'Nothing to apply.'
            : 'Nothing to revert.'
          : `${outcomes.length} migration(s) ${subcommand === 'up' ? 'applied' : 'reverted'}.`,
      )
      return 0
    })
  } catch (error) {
    if (isCogentaError(error) && error.code === 'MIGRATION_DESTRUCTIVE') {
      // The engine already refused. The CLI's job is to make the refusal
      // actionable: name what would be lost, then say the two flags out loud.
      stderr(`${error.message}\n`)
      for (const entry of destructiveDetails(error)) {
        stderr(`  ${entry.id}: ${entry.impact}\n`)
      }
      if (error.hint !== undefined) stderr(`\n${error.hint}\n`)
      stderr('\nRe-run with --confirm-destructive --backup-verified once both are true.\n')
      return 1
    }

    if (isCogentaError(error)) {
      stderr(`${error.code}: ${error.message}\n`)
      if (error.hint !== undefined) stderr(`${error.hint}\n`)
    } else {
      stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
    return 1
  }
}
