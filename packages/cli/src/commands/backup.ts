import { createWriteStream } from 'node:fs'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { createReferenceDocumentStore } from '@cogenta/agents'
import { ANALYTICS_TABLES, ensureAnalyticsTables } from '@cogenta/analytics'
import {
  createNoticeDismissalStore,
  createNoticeHistoryStore,
  NOTICE_DISMISSALS_TABLE,
  NOTICE_HISTORY_TABLE,
} from '@cogenta/api'
import { AUTH_TABLES, ensureAuthTables } from '@cogenta/auth'
import {
  ensureChannelTables,
  ensurePreferenceTables,
  LINKING_TABLES,
  PREFERENCE_TABLES,
} from '@cogenta/channels'
import { COMMENT_TABLES, ensureCommentsTables } from '@cogenta/comments'
import { TABLES as COMMERCE_TABLES, ensureCommerceTables } from '@cogenta/commerce'
import {
  createDatabaseMediaFolderStore,
  createDatabaseMediaStore,
  createDatabaseRegistry,
  createLogger,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
  MEDIA_FOLDER_TABLE,
  MEDIA_TABLE,
} from '@cogenta/core'
import {
  applyRestore,
  buildBackupTables,
  createBackup,
  previewRestore,
  readBackupManifest,
} from '@cogenta/export'
import { ensureFormsTables, FORMS_TABLES } from '@cogenta/forms'
import { ensureMcpConnectionTables, MCP_CONNECTION_TABLE } from '@cogenta/mcp'
import {
  ensureMarketplaceTables,
  ensurePluginProvisionTable,
  ensurePluginTables,
  ensureRegistryTables,
  MARKETPLACE_TABLES,
  PERMISSION_TABLES,
  REGISTRY_TABLES,
} from '@cogenta/plugins'
import {
  ADMIN_THEME_TABLE,
  type CollectionDefinition,
  createNotFoundLogStore,
  createRedirectPatternStore,
  createRedirectStore,
  createScheduledPublishFailureStore,
  createScheduledTaskRegistry,
  createSchemaTables,
  EMBED_PREVIEW_TABLE,
  ensureAdminThemeTable,
  ensureMaintenanceTable,
  ensureMenuTables,
  ensurePatternTables,
  ensureRolePermissionTable,
  ensureSearchConsoleConnectionTable,
  ensureSiteSettingsTables,
  ensureThemeTable,
  MAINTENANCE_TABLE,
  MENU_TABLES,
  NOT_FOUND_LOG_TABLE,
  PATTERN_TABLE,
  REDIRECT_PATTERNS_TABLE,
  REDIRECTS_TABLE,
  ROLE_PERMISSIONS_TABLE,
  SCHEDULED_PUBLISH_FAILURES_TABLE,
  SCHEDULED_TASK_RUNS_TABLE,
  SEARCH_CONSOLE_CONNECTION_TABLE,
  SEARCH_FTS_TABLE,
  SEARCH_TABLE,
  SITE_SETTINGS_TABLE,
  type TaxonomyDefinition,
  THEME_TABLE,
} from '@cogenta/schema'
import { ensureWidgetTables, WIDGETS_TABLE } from '@cogenta/widgets'
import type { Output, Writer } from '../output.js'
import { loadSchemaModule } from './serve.js'

export type BackupSubcommand = 'create' | 'list'
export type RestoreSubcommand = 'preview' | 'apply'

export interface BackupOptions {
  readonly subcommand: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  /** Directory backups are written to — never under the site's storage root (the plan's own piège). Default `.cogenta/backups`. */
  readonly dir?: string
  readonly passphrase?: string
}

export interface RestoreOptions {
  readonly subcommand: string | undefined
  readonly file: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  readonly passphrase?: string
}

const BACKUP_USAGE = `Usage
  cogenta backup create [--passphrase <text>] [--dir <path>]
  cogenta backup list [--dir <path>]

Backs up every table of the site's database — content, users (hashed
passwords only), audit log, media references and, when the site sells
anything, commerce — into one file, engine-independent (never \`pg_dump\`),
with a checksum and an optional passphrase. Written to \`.cogenta/backups\`
by default: never under the site's public storage root.
`

const RESTORE_USAGE = `Usage
  cogenta restore preview <file.zip>
  cogenta restore apply <file.zip> [--passphrase <text>]

Restores a full-site backup. **CLI only, on purpose** (fiche 26, task 4): a
restore overwrites the very database an admin session would be running
against, so it is not offered from the admin API at all — the admin can
restore a *content export* instead (additive, reversible through the trash),
never a whole-database backup.

Restoring writes real rows: run "preview" first to see what already exists in
the target, and restore only into a database you mean to overwrite (a freshly
created one, in the common case — a moved-to or migrated-to engine).
`

/** Exported for `update/` (L22 task 9) — the same default directory, never a second one to keep in sync. */
export function defaultBackupDir(cwd: string): string {
  return join(cwd, '.cogenta', 'backups')
}

/**
 * Opens this site's own database, the way every command in this file that
 * touches it does. Exported for `update/` (L22 task 9): the update system's
 * history view needs the same audit log every other admin action already
 * writes to, which needs the same open connection — never a second way to
 * resolve `cogenta.config.mjs` into a live `DatabaseHandle`.
 */
export async function openSite(
  options: { readonly cwd?: string; readonly env?: Record<string, string | undefined> },
  logger: Logger,
): Promise<{
  readonly db: DatabaseHandle
  readonly site: { name: string; url: string }
  readonly dispose: () => Promise<void>
}> {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const loaded = await loadConfig({ cwd, env })
  const dbSelection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  return {
    db: dbSelection.instance,
    site: { name: loaded.config.site.name, url: loaded.config.site.url },
    dispose: dbSelection.dispose,
  }
}

/**
 * Tables a backup deliberately leaves out, each with the reason it is left
 * out. Nothing here holds anything a restore could not rebuild, or anything
 * that would be *wrong* to carry from one database into another.
 *
 * This map is not documentation: `test/backup-table-coverage.test.ts` walks
 * the real tables of a real served site and fails on any table that is
 * neither backed up nor named here. Adding a table to the product and
 * forgetting it is therefore a failing test, which is how the
 * quarter-of-the-database backup this map was written for went unnoticed for
 * so long.
 */
export const BACKUP_EXCLUDED_TABLES: Readonly<Record<string, string>> = {
  [SEARCH_TABLE]:
    'Derived index. `withSearchIndexing` rewrites it from the entries themselves on every write; restoring a stale copy would be worse than rebuilding it.',
  [SEARCH_FTS_TABLE]:
    "SQLite's virtual full-text table over `cogenta_search`. A virtual table has no rows of its own to dump — the shadow tables below are its storage, and only its own `insert` statements may write them.",
  [`${SEARCH_FTS_TABLE}_config`]: 'FTS5 shadow table — engine-internal storage, never row-copied.',
  [`${SEARCH_FTS_TABLE}_content`]: 'FTS5 shadow table — engine-internal storage, never row-copied.',
  [`${SEARCH_FTS_TABLE}_data`]: 'FTS5 shadow table — engine-internal storage, never row-copied.',
  [`${SEARCH_FTS_TABLE}_docsize`]: 'FTS5 shadow table — engine-internal storage, never row-copied.',
  [`${SEARCH_FTS_TABLE}_idx`]: 'FTS5 shadow table — engine-internal storage, never row-copied.',
  cogenta_vectors:
    'Derived index. Embeddings are recomputed from the indexed content; the pgvector driver creates this table itself and only on Postgres.',
  cogenta_jobs:
    'In-flight work of the database queue driver. A job claimed by the process that took the backup means nothing in the database it is restored into.',
  cogenta_scheduled_task_claims:
    'Compare-and-set lease held by whichever replica is currently running a scheduled task. Restoring one would hand a fresh site a lock nobody holds.',
  [EMBED_PREVIEW_TABLE]:
    'Cache of oEmbed responses (L38), re-fetched on demand. It also holds copies of third-party thumbnails, which a backup has no business carrying.',
  cogenta_analytics_daily_salts:
    'The rotating per-day salt that makes an analytics session hash unlinkable. It is key material, it expires daily, and keeping it next to the events it salts is exactly what the privacy design avoids.',
  cogenta_migrations:
    "The target database's own ledger of which migrations it has applied. Overwriting it with the source's would make the target lie about its own shape.",
  cogenta_migrations_lock:
    'Migration mutex — held only while a migration is running, meaningless outside that process.',
}

/**
 * Every table `cogenta backup` knows how to name, assembled from each
 * package's own table constants — `@cogenta/export` depends on none of them
 * by design (R1/R9), so this is the one place that has to.
 *
 * Whole groups are spread with `Object.values` rather than listed member by
 * member wherever the owning package publishes its tables as one object: a
 * table added to `@cogenta/commerce` or `@cogenta/forms` tomorrow then enters
 * the backup without anyone having to remember this file exists.
 *
 * Order is what a forward-only restore needs — `before` is what content
 * points at (accounts, media), `after` is what points at content (navigation,
 * comments, orders), so a foreign key always meets its target already
 * restored.
 *
 * Exported for `test/backup-table-coverage.test.ts`, which is the only reason
 * the coverage guarantee above is a guarantee rather than a hope.
 */
export async function backupTables(cwd: string): Promise<readonly string[]> {
  const { collections, taxonomies } = await loadSchemaModule(cwd)
  return buildBackupTables({
    collections,
    taxonomies,
    before: [
      // Accounts first: `users` before the credentials, sessions and audit
      // rows that name a user id.
      ...Object.values(AUTH_TABLES),
      // A folder before the media it holds, and media before the entries
      // whose `f.media()` fields name an asset id.
      MEDIA_FOLDER_TABLE,
      MEDIA_TABLE,
    ],
    after: [
      // How the site presents itself.
      SITE_SETTINGS_TABLE,
      THEME_TABLE,
      ADMIN_THEME_TABLE,
      ROLE_PERMISSIONS_TABLE,
      MAINTENANCE_TABLE,
      // Navigation, routing, and the editor's own libraries.
      ...Object.values(MENU_TABLES),
      REDIRECTS_TABLE,
      REDIRECT_PATTERNS_TABLE,
      NOT_FOUND_LOG_TABLE,
      PATTERN_TABLE,
      WIDGETS_TABLE,
      // Publication scheduling: what ran, and what failed to.
      SCHEDULED_TASK_RUNS_TABLE,
      SCHEDULED_PUBLISH_FAILURES_TABLE,
      SEARCH_CONSOLE_CONNECTION_TABLE,
      // Admin notices — which recommendation a person has already dismissed.
      NOTICE_DISMISSALS_TABLE,
      NOTICE_HISTORY_TABLE,
      // Contract F: comments, and the settings that govern them.
      ...Object.values(COMMENT_TABLES),
      // Contract G: forms and everything a visitor has submitted.
      ...Object.values(FORMS_TABLES),
      ...Object.values(ANALYTICS_TABLES),
      // Extensions: what is installed, and what it was allowed to do.
      ...Object.values(REGISTRY_TABLES),
      ...Object.values(PERMISSION_TABLES),
      ...Object.values(MARKETPLACE_TABLES),
      // Channels: which account is linked to which chat, and how it wants
      // to be told about things.
      ...Object.values(LINKING_TABLES),
      ...Object.values(PREFERENCE_TABLES),
      MCP_CONNECTION_TABLE,
      // The assistant's uploaded reference documents. A literal because
      // `@cogenta/agents` keeps this constant module-private on purpose; the
      // coverage test fails if it is ever renamed out from under us.
      'cogenta_reference_documents',
      // Contract E, in its own dependency order (products before variants,
      // orders before their lines). `Object.values` preserves the order
      // `@cogenta/commerce` declares them in, which is already that order.
      ...Object.values(COMMERCE_TABLES),
    ],
  })
}

/**
 * Creates every table a backup or restore touches, on whichever database is
 * open — a fresh site may never have created its media, menu or redirect
 * table (they are created lazily, at first use, the way `assembleSite` does
 * it), and `dumpTable`'s raw `SELECT *` has no fallback for a table that
 * simply is not there yet. Idempotent: every `ensure*` here is `create table
 * if not exists`.
 */
async function ensureAllTables(
  db: DatabaseHandle,
  collections: readonly CollectionDefinition[],
  taxonomies: readonly TaxonomyDefinition[],
): Promise<void> {
  await createSchemaTables(db, collections, taxonomies)
  await ensureAuthTables(db)
  await ensureSiteSettingsTables(db)
  await ensureThemeTable(db)
  await ensureAdminThemeTable(db)
  await ensureRolePermissionTable(db)
  await ensureMaintenanceTable(db)
  await ensureMenuTables(db)
  await ensurePatternTables(db)
  await ensureWidgetTables(db)
  await ensureSearchConsoleConnectionTable(db)
  await ensureCommentsTables(db)
  await ensureFormsTables(db)
  await ensureAnalyticsTables(db)
  await ensureCommerceTables(db)
  await ensurePluginTables(db)
  await ensurePluginProvisionTable(db)
  await ensureRegistryTables(db)
  await ensureMarketplaceTables(db)
  await ensureChannelTables(db)
  await ensurePreferenceTables(db)
  await ensureMcpConnectionTables(db)
  await createRedirectStore({ db }).ensureTable()
  await createRedirectPatternStore({ db }).ensureTable()
  await createNotFoundLogStore({ db }).ensureTable()
  await createScheduledPublishFailureStore(db).ensureTable()
  await createScheduledTaskRegistry({ db }).ensureTable()
  await createNoticeDismissalStore(db).ensureTable()
  await createNoticeHistoryStore(db).ensureTable()
  await createReferenceDocumentStore(db).ensureTable()
  // The media store creates its table lazily on first call; `list()` is the
  // cheapest one that does so without writing anything.
  await createDatabaseMediaStore({ db }).list({ limit: 1 })
  await createDatabaseMediaFolderStore({ db }).list()
}

export interface CreateSiteBackupOptions {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  /** Directory backups are written to. Default `.cogenta/backups`, same as `cogenta backup create`. */
  readonly dir?: string
  readonly passphrase?: string
  /**
   * `backup-` by default (`cogenta backup create`'s own filename). The
   * update system (`update/restore-point.ts`) passes `update-` so a restore
   * point taken automatically before an update is visible as such in
   * `cogenta backup list` / the admin's history view, without a second
   * directory or a second manifest format.
   */
  readonly filenamePrefix?: string
}

export interface CreateSiteBackupResult {
  readonly path: string
  readonly manifest: Awaited<ReturnType<typeof createBackup>>['manifest']
}

/**
 * The actual work behind `cogenta backup create` — factored out so
 * `update/restore-point.ts` calls exactly this, not a reimplementation, for
 * "un point de restauration obligatoire avant toute mise à jour" (L22 task
 * 9, point 2: "réutilise `backup create`/`restore apply`, déjà réels depuis
 * L9 fiche 26"). `runBackup`'s `create` subcommand below is now this
 * function plus CLI-shaped output, nothing else.
 */
export async function createSiteBackup(
  options: CreateSiteBackupOptions,
): Promise<CreateSiteBackupResult> {
  const logger = options.logger ?? createLogger({ level: 'silent' })
  const cwd = options.cwd ?? process.cwd()
  const dir = options.dir ?? defaultBackupDir(cwd)
  const prefix = options.filenamePrefix ?? 'backup-'

  const { collections, taxonomies } = await loadSchemaModule(cwd)
  const tables = await backupTables(cwd)
  const { db, site, dispose } = await openSite(options, logger)
  try {
    await ensureAllTables(db, collections, taxonomies)
    await mkdir(dir, { recursive: true })
    const filename = `${prefix}${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
    const path = join(dir, filename)
    const stream = createWriteStream(path, { mode: 0o600 })
    const { manifest } = await createBackup({
      db,
      site,
      tables,
      write: (chunk) =>
        new Promise((resolve, reject) => {
          stream.write(chunk, (error) => (error ? reject(error) : resolve()))
        }),
      ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
    })
    await new Promise<void>((resolve, reject) => {
      stream.end((error: unknown) => (error ? reject(error) : resolve()))
    })
    return { path, manifest }
  } finally {
    await dispose()
  }
}

export async function runBackup(options: BackupOptions): Promise<number> {
  const { out, stderr } = options
  const logger = options.logger ?? createLogger({ level: 'silent' })
  const cwd = options.cwd ?? process.cwd()
  const dir = options.dir ?? defaultBackupDir(cwd)

  if (options.subcommand === 'list') {
    await mkdir(dir, { recursive: true })
    const files = (await readdir(dir)).filter((name) => name.endsWith('.zip')).sort()
    if (files.length === 0) {
      out.line('No backups yet.')
      return 0
    }
    for (const file of files) {
      try {
        const manifest = await readBackupManifest(join(dir, file))
        const rows = manifest.tables.reduce((sum, table) => sum + table.rows, 0)
        out.line(
          `${file}  ${manifest.createdAt}  ${rows} rows${manifest.encrypted ? '  encrypted' : ''}`,
        )
      } catch {
        out.line(`${file}  (could not read manifest)`)
      }
    }
    return 0
  }

  if (options.subcommand !== 'create') {
    stderr(`Unknown subcommand "${options.subcommand ?? ''}".\n\n${BACKUP_USAGE}`)
    return 2
  }

  try {
    const { path, manifest } = await createSiteBackup({
      cwd,
      dir,
      logger,
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
    })

    const rows = manifest.tables.reduce((sum, table) => sum + table.rows, 0)
    out.heading('Backup created')
    out.line(`${path}`)
    out.line(`${manifest.tables.length} tables, ${rows} rows, checksum ${manifest.checksum}`)
    if (manifest.encrypted) out.line('Encrypted with the passphrase you supplied.')
    return 0
  } catch (error) {
    return reportError(error, stderr)
  }
}

export async function runRestore(options: RestoreOptions): Promise<number> {
  const { out, stderr } = options
  const logger = options.logger ?? createLogger({ level: 'silent' })

  if (options.subcommand === undefined) {
    stderr(`cogenta restore needs a subcommand.\n\n${RESTORE_USAGE}`)
    return 2
  }
  if (options.subcommand !== 'preview' && options.subcommand !== 'apply') {
    stderr(`Unknown subcommand "${options.subcommand}".\n\n${RESTORE_USAGE}`)
    return 2
  }
  if (options.file === undefined || options.file.trim().length === 0) {
    stderr(`A backup file path is required.\n\n${RESTORE_USAGE}`)
    return 2
  }

  try {
    const cwd = options.cwd ?? process.cwd()
    const { collections, taxonomies } = await loadSchemaModule(cwd)
    const { db, dispose } = await openSite(options, logger)
    try {
      // Preview and apply both need every table to exist: preview so a
      // fresh site reports "0 rows existing" rather than throwing, apply so
      // the insert has somewhere to land.
      await ensureAllTables(db, collections, taxonomies)
      if (options.subcommand === 'preview') {
        const { manifest, tables } = await previewRestore(
          options.file,
          db,
          options.passphrase === undefined ? {} : { passphrase: options.passphrase },
        )
        out.heading('Restore preview')
        out.line(`Backup from ${manifest.createdAt} (${manifest.dialect})`)
        for (const table of tables) {
          const note = table.rowsExisting > 0 ? `  — ${table.rowsExisting} rows already there` : ''
          out.line(`${table.name}: ${table.rowsInBackup} rows in backup${note}`)
        }
        return 0
      }

      const report = await applyRestore(options.file, {
        db,
        ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
      })
      out.heading('Restore applied')
      for (const table of report.tables) out.line(`${table.name}: ${table.rows} rows restored`)
      return 0
    } finally {
      await dispose()
    }
  } catch (error) {
    return reportError(error, stderr)
  }
}

function reportError(error: unknown, stderr: Writer): number {
  if (isCogentaError(error)) {
    stderr(`${error.code}: ${error.message}\n`)
    if (error.hint !== undefined) stderr(`${error.hint}\n`)
  } else {
    stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
  }
  return 1
}
