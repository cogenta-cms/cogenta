import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { createRolePermissionStore } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { run } from '../src/index.js'

/**
 * `cogenta roles export` (fiche 63, task 3's last requirement) — freezes
 * `cogenta_role_permissions` into a file a site can commit to git. Against a
 * real project and a real SQLite database, never a mock.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-roles-'))
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
    `export default [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['editor'],
    },
  },
]
`,
    'utf8',
  )
  return root
}

let out: string[]
let err: string[]
const stdout = (text: string): void => {
  out.push(text)
}
const stderr = (text: string): void => {
  err.push(text)
}
const output = (): string => out.join('')
const errors = (): string => err.join('')

const roles = (root: string, ...args: string[]): Promise<number> =>
  run({ argv: ['roles', ...args, '--cwd', root], stdout, stderr, env: {} })

describe('cogenta roles export', () => {
  it('writes an empty overrides array when the table has never been written to', async () => {
    const root = await project()
    out = []
    err = []
    expect(await roles(root, 'export')).toBe(0)

    const written = JSON.parse(
      await readFile(join(root, 'cogenta.role-permissions.json'), 'utf8'),
    ) as { readonly overrides: readonly unknown[] }
    expect(written.overrides).toEqual([])
    expect(output()).toContain('0 overrides written')
  })

  it('freezes what an admin actually wrote to the database table', async () => {
    const root = await project()
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const store = createRolePermissionStore({
      db,
      collections: [
        {
          name: 'article',
          labels: { singular: 'Article', plural: 'Articles' },
          fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
          permissions: {
            read: ['public'],
            create: ['editor'],
            update: ['editor'],
            publish: ['editor'],
            delete: ['editor'],
          },
        },
      ],
      taxonomies: [],
    })
    await store.set({
      targetType: 'collection',
      targetName: 'article',
      action: 'create',
      roles: ['contributor'],
      updatedBy: 'user-1',
    })
    await db.close()

    out = []
    err = []
    expect(await roles(root, 'export')).toBe(0)

    const written = JSON.parse(
      await readFile(join(root, 'cogenta.role-permissions.json'), 'utf8'),
    ) as {
      readonly version: number
      readonly overrides: readonly {
        readonly targetName: string
        readonly action: string
        readonly roles: readonly string[]
      }[]
    }
    expect(written.overrides).toHaveLength(1)
    expect(written.overrides[0]).toMatchObject({
      targetName: 'article',
      action: 'create',
      roles: ['contributor'],
    })
    expect(output()).toContain('1 override written')
  })

  it('writes to --out when given one, instead of the project root default', async () => {
    const root = await project()
    const customPath = join(root, 'permissions-snapshot.json')
    out = []
    err = []
    expect(await roles(root, 'export', '--out', customPath)).toBe(0)

    const written = JSON.parse(await readFile(customPath, 'utf8')) as {
      readonly overrides: unknown
    }
    expect(written.overrides).toEqual([])
  })

  it('prints usage and exits 0 with no subcommand', async () => {
    const root = await project()
    out = []
    err = []
    expect(await roles(root)).toBe(0)
    expect(output()).toContain('cogenta roles export')
  })

  it('rejects an unknown subcommand', async () => {
    const root = await project()
    out = []
    err = []
    expect(await roles(root, 'nonsense')).toBe(2)
    expect(errors()).toContain('Unknown "cogenta roles" subcommand')
  })
})
