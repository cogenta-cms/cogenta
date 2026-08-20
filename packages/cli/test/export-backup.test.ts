import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { createContentStore, createSchemaTables } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { run } from '../src/index.js'

/**
 * `cogenta export` / `cogenta import content` / `cogenta backup` /
 * `cogenta restore`, end to end against a real SQLite project directory —
 * fiche 26, tasks 1, 3 and 4. No HTTP server: these are pure CLI commands,
 * the same shape `cogenta migrate` already tests.
 */

const NOTE: CollectionDefinition = {
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: {
    body: { kind: 'text', options: { max: 500 } },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}
const COLLECTIONS: readonly CollectionDefinition[] = [NOTE]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-export-cli-'))
  const { writeFile, mkdir } = await import('node:fs/promises')
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  await mkdir(join(root, 'migrations'), { recursive: true })
  return root
}

async function seed(root: string): Promise<void> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await createSchemaTables(db, COLLECTIONS)
  const store = createContentStore({ db, collection: NOTE })
  await store.create({ status: 'published', values: { body: 'Hello from the source site' } })
  await db.close()
}

let out: string[]
let err: string[]
const stdout = (text: string): void => void out.push(text)
const stderr = (text: string): void => void err.push(text)

let roots: string[] = []
afterEach(async () => {
  out = []
  err = []
  roots = []
})

describe('cogenta export / cogenta import content', () => {
  it('round-trips content through a file, into a second, empty project', async () => {
    out = []
    err = []
    const source = await project()
    const target = await project()
    roots.push(source, target)
    await seed(source)

    const exportFile = join(source, 'content.ndjson')
    const exportCode = await run({
      argv: ['export', exportFile, '--cwd', source],
      stdout,
      stderr,
      env: {},
    })
    expect(err.join('')).toBe('')
    expect(exportCode).toBe(0)
    expect(out.join('')).toContain('1 entries')

    const contents = await readFile(exportFile, 'utf8')
    expect(contents.split('\n').filter(Boolean).length).toBeGreaterThan(1)
    expect(JSON.parse(contents.split('\n')[0] ?? '{}')).toMatchObject({
      kind: 'manifest',
      format: 'cogenta-export',
    })

    out = []
    err = []
    const importCode = await run({
      argv: ['import', 'content', exportFile, '--cwd', target],
      stdout,
      stderr,
      env: {},
    })
    expect(err.join('')).toBe('')
    expect(importCode).toBe(0)
    expect(out.join('')).toContain('entries: 1')

    const db = await createSqliteHandle({ url: join(target, 'site.db') })
    const store = createContentStore({ db, collection: NOTE })
    const page = await store.list({ state: 'published' })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.values.body).toBe('Hello from the source site')
    await db.close()
  })
})

describe('cogenta backup / cogenta restore', () => {
  it('backs up every table and restores it into a fresh project', async () => {
    out = []
    err = []
    const source = await project()
    const target = await project()
    roots.push(source, target)
    await seed(source)

    const backupCode = await run({
      argv: ['backup', 'create', '--cwd', source],
      stdout,
      stderr,
      env: {},
    })
    expect(err.join('')).toBe('')
    expect(backupCode).toBe(0)

    const backupFiles = await readdir(join(source, '.cogenta', 'backups'))
    expect(backupFiles).toHaveLength(1)
    const backupFile = backupFiles[0]
    if (backupFile === undefined) throw new Error('expected exactly one backup file')
    const backupPath = join(source, '.cogenta', 'backups', backupFile)

    out = []
    const listCode = await run({
      argv: ['backup', 'list', '--cwd', source],
      stdout,
      stderr,
      env: {},
    })
    expect(listCode).toBe(0)
    expect(out.join('')).toContain(backupFile)

    // `cogenta restore` ensures every table exists itself (the same
    // `createSchemaTables`/`ensureAuthTables`/… a fresh install would run at
    // its first `cogenta serve`), so a target that was scaffolded but never
    // served can still be restored into.

    out = []
    err = []
    const previewCode = await run({
      argv: ['restore', 'preview', backupPath, '--cwd', target],
      stdout,
      stderr,
      env: {},
    })
    expect(err.join('')).toBe('')
    expect(previewCode).toBe(0)
    expect(out.join('')).toContain('rows in backup')

    out = []
    const applyCode = await run({
      argv: ['restore', 'apply', backupPath, '--cwd', target],
      stdout,
      stderr,
      env: {},
    })
    expect(applyCode).toBe(0)

    const db = await createSqliteHandle({ url: join(target, 'site.db') })
    const store = createContentStore({ db, collection: NOTE })
    const page = await store.list({ state: 'published' })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.values.body).toBe('Hello from the source site')
    await db.close()
  })

  it('encrypts with a passphrase and refuses to restore without it', async () => {
    out = []
    err = []
    const source = await project()
    roots.push(source)
    await seed(source)

    const backupCode = await run({
      argv: ['backup', 'create', '--cwd', source, '--passphrase', 'a strong passphrase'],
      stdout,
      stderr,
      env: {},
    })
    expect(backupCode).toBe(0)

    const backupFiles = await readdir(join(source, '.cogenta', 'backups'))
    const backupFile = backupFiles[0]
    if (backupFile === undefined) throw new Error('expected exactly one backup file')
    const backupPath = join(source, '.cogenta', 'backups', backupFile)

    out = []
    err = []
    const refusedCode = await run({
      argv: ['restore', 'preview', backupPath, '--cwd', source],
      stdout,
      stderr,
      env: {},
    })
    expect(refusedCode).toBe(1)
    expect(err.join('')).toContain('BACKUP_PASSPHRASE_REQUIRED')

    out = []
    err = []
    const okCode = await run({
      argv: [
        'restore',
        'preview',
        backupPath,
        '--cwd',
        source,
        '--passphrase',
        'a strong passphrase',
      ],
      stdout,
      stderr,
      env: {},
    })
    expect(okCode).toBe(0)
  }, 30_000)
})
