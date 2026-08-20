import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createSchemaTables,
  defineCollection,
  f,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup } from '../src/backup.js'
import { applyRestore, previewRestore, readBackupManifest, verifyBackup } from '../src/restore.js'
import { buildBackupTables } from '../src/tables.js'

const note: CollectionDefinition = defineCollection({
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: { body: f.text({ max: 500 }) },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

const collections = [note]
const tables = buildBackupTables({ collections, taxonomies: [] })

async function writeBackup(path: string, db: DatabaseHandle, passphrase?: string): Promise<void> {
  const chunks: Buffer[] = []
  await createBackup({
    db,
    site: { name: 'Backup test site', url: 'https://example.test' },
    tables,
    write: (chunk) => void chunks.push(chunk),
    ...(passphrase === undefined ? {} : { passphrase }),
  })
  await writeFile(path, Buffer.concat(chunks))
}

describe('createBackup / verifyBackup / applyRestore', () => {
  let directory: string
  let sourceDb: DatabaseHandle
  let targetDb: DatabaseHandle

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-backup-'))
    sourceDb = await createSqliteHandle({ url: join(directory, 'source.db') })
    targetDb = await createSqliteHandle({ url: join(directory, 'target.db') })
    await createSchemaTables(sourceDb, collections)
    await createSchemaTables(targetDb, collections)
  })

  afterEach(async () => {
    await sourceDb.close()
    await targetDb.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('restores every row into a freshly created target', async () => {
    const store = createContentStore({ db: sourceDb, collection: note })
    await store.create({ status: 'published', values: { body: 'first' } })
    await store.create({ status: 'published', values: { body: 'second' } })

    const path = join(directory, 'backup.zip')
    await writeBackup(path, sourceDb)

    const manifest = await readBackupManifest(path)
    expect(manifest.format).toBe('cogenta-backup')
    const noteTable = manifest.tables.find((t) => t.name.endsWith('_note'))
    expect(noteTable?.rows).toBe(2)

    const { tables: preview } = await previewRestore(path, targetDb)
    const notePreview = preview.find((t) => t.name.endsWith('_note'))
    expect(notePreview?.rowsInBackup).toBe(2)
    expect(notePreview?.rowsExisting).toBe(0)

    const report = await applyRestore(path, { db: targetDb })
    const restoredNoteTable = report.tables.find((t) => t.name.endsWith('_note'))
    expect(restoredNoteTable?.rows).toBe(2)

    const targetStore = createContentStore({ db: targetDb, collection: note })
    const page = await targetStore.list({ state: 'published' })
    expect(page.items.map((item) => item.values.body).sort()).toEqual(['first', 'second'])
  })

  it('detects a corrupted backup before restoring anything', async () => {
    const store = createContentStore({ db: sourceDb, collection: note })
    await store.create({ status: 'published', values: { body: 'intact' } })

    const path = join(directory, 'backup.zip')
    await writeBackup(path, sourceDb)

    const raw = await import('node:fs/promises').then((fs) => fs.readFile(path))
    // Flip a byte inside the row content itself — not the ZIP or manifest
    // structure, so the checksum, not a parse failure, is what catches it.
    const marker = raw.indexOf(Buffer.from('intact', 'utf8'))
    expect(marker).toBeGreaterThan(-1)
    raw[marker] = (raw[marker] ?? 0) ^ 0xff
    await writeFile(path, raw)

    await expect(verifyBackup(path)).rejects.toMatchObject({ code: 'BACKUP_CHECKSUM_MISMATCH' })
    await expect(applyRestore(path, { db: targetDb })).rejects.toMatchObject({
      code: 'BACKUP_CHECKSUM_MISMATCH',
    })

    const targetStore = createContentStore({ db: targetDb, collection: note })
    const page = await targetStore.list({ state: 'published' })
    expect(page.items).toHaveLength(0)
  })

  it('encrypts and restores with a passphrase, and refuses the wrong one', async () => {
    const store = createContentStore({ db: sourceDb, collection: note })
    await store.create({ status: 'published', values: { body: 'confidential' } })

    const path = join(directory, 'backup.zip')
    await writeBackup(path, sourceDb, 'a strong passphrase')

    const manifest = await readBackupManifest(path)
    expect(manifest.encrypted).toBe(true)

    await expect(verifyBackup(path)).rejects.toMatchObject({ code: 'BACKUP_PASSPHRASE_REQUIRED' })
    await expect(verifyBackup(path, { passphrase: 'the wrong passphrase' })).rejects.toMatchObject({
      code: 'BACKUP_DECRYPTION_FAILED',
    })

    const report = await applyRestore(path, { db: targetDb, passphrase: 'a strong passphrase' })
    expect(report.tables.some((t) => t.rows > 0)).toBe(true)

    const targetStore = createContentStore({ db: targetDb, collection: note })
    const page = await targetStore.list({ state: 'published' })
    expect(page.items.map((item) => item.values.body)).toEqual(['confidential'])
  })
})
