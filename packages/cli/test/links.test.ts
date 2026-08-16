import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { type CollectionDefinition, createContentStore, createSchemaTables } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { runLinks } from '../src/commands/links.js'
import { createOutput } from '../src/output.js'

/**
 * The command, against a real project directory and a real SQLite database —
 * the same content a `cogenta serve` would read.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    versioning: { drafts: true, history: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      body: { kind: 'blocks', options: { allow: [] } },
    },
    permissions: { read: ['public'] },
  },
]

interface Seeded {
  readonly slug: string
  readonly hrefs?: readonly string[]
  readonly publish?: boolean
}

async function project(entries: readonly Seeded[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-links-cli-'))
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

  const collection = COLLECTIONS[0] as CollectionDefinition
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await createSchemaTables(db, COLLECTIONS)
  const store = createContentStore({ db, collection })
  for (const entry of entries) {
    const created = await store.create({
      values: { title: entry.slug, slug: entry.slug },
      blocks: {
        body: (entry.hrefs ?? []).map((href, index) => ({
          key: `b${index}`,
          type: 'prose',
          version: '1.0.0',
          data: { href },
        })),
      } as never,
    })
    if (entry.publish !== false) await store.publish(created.id)
  }
  await db.close()
  return root
}

function capture() {
  let text = ''
  const write = (chunk: string) => {
    text += chunk
  }
  return {
    out: createOutput(write, false),
    stderr: write,
    read: () => text,
  }
}

describe('cogenta links check', () => {
  it('exits 0 and says so when every internal link resolves', async () => {
    const root = await project([{ slug: 'target' }, { slug: 'source', hrefs: ['/target'] }])
    const io = capture()

    const code = await runLinks({ subcommand: 'check', cwd: root, out: io.out, stderr: io.stderr })

    expect(code).toBe(0)
    expect(io.read()).toContain('Nothing broken')
  })

  it('exits 1 and names the entry, the field and the target for a broken link', async () => {
    const root = await project([{ slug: 'source', hrefs: ['/deleted-last-week'] }])
    const io = capture()

    const code = await runLinks({ subcommand: 'check', cwd: root, out: io.out, stderr: io.stderr })

    expect(code).toBe(1)
    const output = io.read()
    expect(output).toContain('1 broken link(s)')
    expect(output).toContain('/deleted-last-week')
    expect(output).toContain('blocks.body[0].data.href')
    expect(output).toContain('does not exist')
  })

  it('reports a link to a page that exists but was never published', async () => {
    const root = await project([
      { slug: 'not-yet', publish: false },
      { slug: 'source', hrefs: ['/not-yet'] },
    ])
    const io = capture()

    const code = await runLinks({ subcommand: 'check', cwd: root, out: io.out, stderr: io.stderr })

    expect(code).toBe(1)
    expect(io.read()).toContain('/not-yet')
  })

  it('says how many external links it did not follow', async () => {
    const root = await project([{ slug: 'source', hrefs: ['https://example.org/elsewhere'] }])
    const io = capture()

    const code = await runLinks({ subcommand: 'check', cwd: root, out: io.out, stderr: io.stderr })

    expect(code).toBe(0)
    expect(io.read()).toContain('Pass --external')
  })

  it('refuses a missing or unknown subcommand with a usage error', async () => {
    const io = capture()
    expect(await runLinks({ subcommand: undefined, out: io.out, stderr: io.stderr })).toBe(2)
    expect(await runLinks({ subcommand: 'fix', out: io.out, stderr: io.stderr })).toBe(2)
    expect(io.read()).toContain('Only "check" exists today')
  })
})
