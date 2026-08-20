import { createHash } from 'node:crypto'
import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'
import type { BackupManifest } from './backup.js'
import { decryptStream } from './crypto.js'
import { openZip, type ZipReader } from './zip-reader.js'

async function bufferEntry(zip: ZipReader, name: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of zip.read(name)) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export async function readBackupManifest(path: string): Promise<BackupManifest> {
  const zip = await openZip(path)
  try {
    const raw = await bufferEntry(zip, 'manifest.json')
    return JSON.parse(raw.toString('utf8')) as BackupManifest
  } finally {
    await zip.close()
  }
}

function tablePlaintext(
  zip: ZipReader,
  table: { readonly file: string },
  manifest: BackupManifest,
  passphrase: string | undefined,
): AsyncIterable<Buffer> {
  const raw = zip.read(table.file)
  if (!manifest.encrypted) return raw
  if (passphrase === undefined) {
    throw new CogentaError({
      code: 'BACKUP_PASSPHRASE_REQUIRED',
      message: 'This backup is encrypted; a passphrase is required to read it.',
      hint: 'Pass the passphrase used at `cogenta backup --encrypt` time.',
    })
  }
  return decryptStream(raw, passphrase)
}

export interface VerifyBackupOptions {
  readonly passphrase?: string
}

/**
 * Recomputes the manifest's checksum over the backup's own bytes and throws
 * if it does not match — task 3's "somme de contrôle vérifiée avant
 * restauration", called by `applyRestore` before it writes a single row, and
 * exposed on its own for a caller (the admin's restore screen, `cogenta
 * restore --dry-run`) that wants to check a file without touching a database.
 */
export async function verifyBackup(
  path: string,
  options: VerifyBackupOptions = {},
): Promise<BackupManifest> {
  const manifest = await readBackupManifest(path)
  const zip = await openZip(path)
  try {
    const hash = createHash('sha256')
    for (const table of manifest.tables) {
      for await (const chunk of tablePlaintext(zip, table, manifest, options.passphrase)) {
        hash.update(chunk)
      }
    }
    const checksum = hash.digest('hex')
    if (checksum !== manifest.checksum) {
      throw new CogentaError({
        code: 'BACKUP_CHECKSUM_MISMATCH',
        message: 'The backup file does not match its own checksum.',
        hint: 'The file is corrupted or was modified after it was created. Restore from a different copy.',
        details: { expected: manifest.checksum, found: checksum },
      })
    }
    return manifest
  } finally {
    await zip.close()
  }
}

export interface RestorePreviewTable {
  readonly name: string
  readonly rowsInBackup: number
  readonly rowsExisting: number
}

/**
 * "Ce qui sera écrasé, ce qui sera ajouté" (task 4) — a read-only pass that
 * verifies the checksum and, for every table the target database already has
 * created, counts what is already there. A table this database has never
 * created (a fresh site, mid-migration) reports `rowsExisting: 0` rather than
 * failing, since that is exactly the case an empty-site restore expects.
 */
export async function previewRestore(
  path: string,
  db: DatabaseHandle,
  options: VerifyBackupOptions = {},
): Promise<{ readonly manifest: BackupManifest; readonly tables: readonly RestorePreviewTable[] }> {
  const manifest = await verifyBackup(path, options)
  const tables: RestorePreviewTable[] = []
  for (const table of manifest.tables) {
    let rowsExisting = 0
    try {
      const result = await db.query<{ readonly n: number | string }>(
        sql`select count(*) as n from ${identifier(table.name, db.dialect)}`,
      )
      rowsExisting = Number(result.rows[0]?.n ?? 0)
    } catch {
      // The table does not exist yet on this database — a fresh site being
      // restored into before its schema has been created. That is reported
      // as "nothing there yet", not as a failure of the preview.
      rowsExisting = 0
    }
    tables.push({ name: table.name, rowsInBackup: table.rows, rowsExisting })
  }
  return { manifest, tables }
}

export interface ApplyRestoreOptions extends VerifyBackupOptions {
  readonly db: DatabaseHandle
}

export interface RestoreReport {
  readonly tables: readonly { readonly name: string; readonly rows: number }[]
}

function* splitLines(buffer: string): Generator<string> {
  let start = 0
  for (;;) {
    const index = buffer.indexOf('\n', start)
    if (index === -1) {
      if (start < buffer.length) yield buffer.slice(start)
      return
    }
    yield buffer.slice(start, index)
    start = index + 1
  }
}

/**
 * Restores every table of a backup, in the manifest's own order — the same
 * dependency order `buildBackupTables` produced it in, so a foreign key never
 * meets a row it references before that row exists.
 *
 * **Full restore only, by design (task 4).** This function does not decide
 * who may call it; `packages/cli`'s `cogenta restore` is the only caller
 * this codebase gives a full restore to — the admin API restores a *content*
 * export instead (`importContent`), never a whole-database backup, because
 * that would let a browser session overwrite the database it is itself
 * running against.
 */
export async function applyRestore(
  path: string,
  options: ApplyRestoreOptions,
): Promise<RestoreReport> {
  const manifest = await verifyBackup(
    path,
    options.passphrase === undefined ? {} : { passphrase: options.passphrase },
  )
  const zip = await openZip(path)
  const report: { name: string; rows: number }[] = []

  try {
    for (const table of manifest.tables) {
      let rows = 0
      let carry = ''
      const tableIdentifier = identifier(table.name, options.db.dialect)

      for await (const chunk of tablePlaintext(zip, table, manifest, options.passphrase)) {
        carry += chunk.toString('utf8')
        const lastNewline = carry.lastIndexOf('\n')
        if (lastNewline === -1) continue
        const complete = carry.slice(0, lastNewline)
        carry = carry.slice(lastNewline + 1)
        for (const line of splitLines(complete)) {
          if (line.trim().length === 0) continue
          await insertRow(
            options.db,
            tableIdentifier,
            table.name,
            JSON.parse(line) as Record<string, unknown>,
          )
          rows += 1
        }
      }
      if (carry.trim().length > 0) {
        await insertRow(
          options.db,
          tableIdentifier,
          table.name,
          JSON.parse(carry) as Record<string, unknown>,
        )
        rows += 1
      }

      report.push({ name: table.name, rows })
    }
  } finally {
    await zip.close()
  }

  return { tables: report }
}

function joinFragments(parts: readonly SqlFragment[], separator: string): SqlFragment {
  return parts.reduce<SqlFragment>(
    (acc, next, index) => (index === 0 ? next : sql`${acc}${unsafeRaw(separator)}${next}`),
    unsafeRaw(''),
  )
}

async function insertRow(
  db: DatabaseHandle,
  table: SqlFragment,
  tableName: string,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row)
  if (columns.length === 0) return

  const columnList = joinFragments(
    columns.map((column) => identifier(column, db.dialect)),
    ', ',
  )
  const valueList = joinFragments(
    columns.map((column) => sql`${row[column]}`),
    ', ',
  )

  try {
    await db.query(sql`insert into ${table} (${columnList}) values (${valueList})`)
  } catch (cause) {
    throw new CogentaError({
      code: 'RESTORE_CONFLICT',
      message: `Could not insert a row into "${tableName}" while restoring.`,
      hint: 'The target database is probably not empty. Restore into a freshly created database.',
      cause,
    })
  }
}
