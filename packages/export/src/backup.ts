import { createHash } from 'node:crypto'
import { type DatabaseHandle, identifier, limit, sql } from '@cogenta/core'
import { encryptStream } from './crypto.js'
import { createZipWriter } from './zip-writer.js'

const BATCH_SIZE = 500

export const BACKUP_FORMAT = 'cogenta-backup' as const
export const BACKUP_FORMAT_VERSION = '1.0' as const

export interface BackupManifest {
  readonly format: typeof BACKUP_FORMAT
  readonly version: typeof BACKUP_FORMAT_VERSION
  readonly createdAt: string
  readonly dialect: string
  readonly site: { readonly name: string; readonly url: string }
  readonly tables: readonly {
    readonly name: string
    readonly rows: number
    readonly file: string
  }[]
  /** sha256 over every table's **plaintext** NDJSON bytes, concatenated in table order — verified before any restore writes a row, independent of whether the archive is encrypted. */
  readonly checksum: string
  readonly encrypted: boolean
}

/**
 * Streams every row of one table as NDJSON, in batches of `BATCH_SIZE` — this
 * is the "never assembled in memory" rule applied to task 3, the same way
 * `exportMediaArchive` applies it to task 2: a table of a million rows costs
 * this function one batch of memory, not a million rows of it.
 *
 * `order by 1` is deliberate rather than naming a column: every table this
 * package dumps has its primary key as the first declared column (every
 * `create table` in this codebase writes `id … primary key` first), so
 * ordinal position gives a stable order without this generic dumper having
 * to know each table's key.
 */
export async function* dumpTable(db: DatabaseHandle, table: string): AsyncGenerator<string> {
  const identifierFragment = identifier(table, db.dialect)
  let offset = 0
  for (;;) {
    const page = await db.query(
      sql`select * from ${identifierFragment} order by 1 limit ${limit(BATCH_SIZE)} offset ${limit(offset)}`,
    )
    for (const row of page.rows) yield `${JSON.stringify(row)}\n`
    if (page.rows.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }
}

export interface CreateBackupOptions {
  readonly db: DatabaseHandle
  readonly site: { readonly name: string; readonly url: string }
  readonly tables: readonly string[]
  /** Receives each chunk of the backup file as it is produced. */
  readonly write: (chunk: Buffer) => Promise<void> | void
  /** When set, each table's content (never the manifest — row counts and a checksum, not secrets) is encrypted with this passphrase — task 3's "chiffrement optionnel". */
  readonly passphrase?: string
  readonly now?: () => Date
}

export interface CreateBackupResult {
  readonly manifest: BackupManifest
}

/**
 * Builds one backup file: a ZIP containing `manifest.json` and one
 * `<table>.ndjson`(`.enc`) per table, each streamed straight from the
 * database into a ZIP entry — `dumpTable`'s batches flow through
 * `zip.addFile`'s `AsyncIterable<Buffer>` form, so this function never holds
 * more than one batch of one table in memory, encrypted or not.
 *
 * The checksum in the manifest is a `sha256` over every table's *plaintext*
 * bytes, computed as they stream past (before encryption, if any) — a
 * restore can then verify content integrity the same way regardless of
 * whether the file is encrypted (task 3's own acceptance criterion).
 */
export async function createBackup(options: CreateBackupOptions): Promise<CreateBackupResult> {
  const now = options.now ?? (() => new Date())
  const checksumHash = createHash('sha256')
  const tableCounts: { name: string; rows: number; file: string }[] = []
  const passphrase = options.passphrase

  const zip = createZipWriter({ write: (chunk) => options.write(chunk) })

  for (const table of options.tables) {
    let rows = 0
    async function* hashedPlaintext(): AsyncGenerator<Buffer> {
      for await (const line of dumpTable(options.db, table)) {
        rows += 1
        const chunk = Buffer.from(line, 'utf8')
        checksumHash.update(chunk)
        yield chunk
      }
    }

    const file = passphrase === undefined ? `${table}.ndjson` : `${table}.ndjson.enc`
    const content =
      passphrase === undefined ? hashedPlaintext() : encryptStream(hashedPlaintext(), passphrase)
    await zip.addFile(file, content)
    tableCounts.push({ name: table, rows, file })
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    createdAt: now().toISOString(),
    dialect: options.db.dialect,
    site: options.site,
    tables: tableCounts,
    encrypted: passphrase !== undefined,
    checksum: checksumHash.digest('hex'),
  }

  await zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))
  await zip.finish()

  return { manifest }
}
