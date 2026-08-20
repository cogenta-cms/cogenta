import { createWriteStream } from 'node:fs'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { AUTH_TABLES, ensureAuthTables } from '@cogenta/auth'
import {
  createDatabaseMediaStore,
  createDatabaseRegistry,
  createLogger,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
  MEDIA_TABLE,
} from '@cogenta/core'
import {
  applyRestore,
  buildBackupTables,
  createBackup,
  previewRestore,
  readBackupManifest,
} from '@cogenta/export'
import {
  type CollectionDefinition,
  createRedirectStore,
  createSchemaTables,
  ensureMenuTables,
  MENU_TABLES,
  REDIRECTS_TABLE,
  type TaxonomyDefinition,
} from '@cogenta/schema'
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

function defaultBackupDir(cwd: string): string {
  return join(cwd, '.cogenta', 'backups')
}

async function openSite(
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
 * Every table `cogenta backup` knows how to name, assembled from each
 * package's own table constants — `@cogenta/export` depends on none of them
 * by design (R1/R9), so this is the one place that has to.
 */
async function tablesFor(cwd: string): Promise<readonly string[]> {
  const { collections, taxonomies } = await loadSchemaModule(cwd)
  return buildBackupTables({
    collections,
    taxonomies,
    before: [...Object.values(AUTH_TABLES), MEDIA_TABLE],
    after: [MENU_TABLES.menus, MENU_TABLES.items, REDIRECTS_TABLE],
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
  await ensureMenuTables(db)
  await createRedirectStore({ db }).ensureTable()
  // The media store creates its table lazily on first call; `list()` is the
  // cheapest one that does so without writing anything.
  await createDatabaseMediaStore({ db }).list({ limit: 1 })
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
    const { collections, taxonomies } = await loadSchemaModule(cwd)
    const tables = await tablesFor(cwd)
    const { db, site, dispose } = await openSite(options, logger)
    try {
      await ensureAllTables(db, collections, taxonomies)
      await mkdir(dir, { recursive: true })
      const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
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

      const rows = manifest.tables.reduce((sum, table) => sum + table.rows, 0)
      out.heading('Backup created')
      out.line(`${path}`)
      out.line(`${manifest.tables.length} tables, ${rows} rows, checksum ${manifest.checksum}`)
      if (manifest.encrypted) out.line('Encrypted with the passphrase you supplied.')
      return 0
    } finally {
      await dispose()
    }
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
