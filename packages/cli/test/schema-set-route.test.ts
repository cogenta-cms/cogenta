import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore, createSchemaTables, createTaxonomyStore } from '@cogenta/schema'
import { contentPackFor } from '@cogenta/starters'
import { afterEach, describe, expect, it } from 'vitest'
import { runSchema } from '../src/commands/schema-localize.js'
import { setRouteInSchemaFile } from '../src/commands/schema-set-route.js'
import { createOutput } from '../src/output.js'

/**
 * `cogenta schema set-route` — brings a site scaffolded before the category
 * joined the address of an entry (`schema@2.5`) to the pattern a new scaffold
 * has, without touching anything but that one line of `cogenta.schema.mjs`.
 */

const dirs: string[] = []

const BODY = [
  {
    _key: 'a',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 'b', _type: 'span', text: 'x', marks: [] }],
    markDefs: [],
  },
]

const NEW_PATTERN = '/blog/:category/:slug'
const OLD_PATTERN = '/blog/:slug'

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const pack = contentPackFor('blog', 'fr', ['fr'])
const collections = pack?.collections ?? []
const taxonomies = pack?.taxonomies ?? []

/** What a new scaffold writes, and what a site scaffolded before this change holds. */
function fileWith(pattern: string): string {
  return `export default ${JSON.stringify(collections, null, 2).replace(NEW_PATTERN, pattern)}\n\nexport const taxonomies = ${JSON.stringify(taxonomies, null, 2)}\n`
}

async function siteWith(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cogenta-set-route-'))
  dirs.push(dir)
  await writeFile(join(dir, 'cogenta.schema.mjs'), source, 'utf8')
  return dir
}

describe('setRouteInSchemaFile', () => {
  it('changes only the pattern of the named collection, and keeps the file it started from', async () => {
    const original = fileWith(OLD_PATTERN)
    const dir = await siteWith(original)

    const outcome = await setRouteInSchemaFile(dir, 'post', NEW_PATTERN)

    expect(outcome).toMatchObject({
      status: 'updated',
      collection: 'post',
      from: OLD_PATTERN,
      to: NEW_PATTERN,
    })
    // Same result as a fresh scaffold, byte for byte.
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(fileWith(NEW_PATTERN))
    expect(await readFile(join(dir, 'cogenta.schema.mjs.before-set-route'), 'utf8')).toBe(original)
  })

  it('is a dry run when asked to be: it reports the change and writes nothing', async () => {
    const original = fileWith(OLD_PATTERN)
    const dir = await siteWith(original)

    expect(await setRouteInSchemaFile(dir, 'post', NEW_PATTERN, { dryRun: true })).toMatchObject({
      status: 'would-update',
      from: OLD_PATTERN,
      to: NEW_PATTERN,
    })
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(original)
    await expect(stat(join(dir, 'cogenta.schema.mjs.before-set-route'))).rejects.toThrow()
  })

  it('does nothing the second time', async () => {
    const dir = await siteWith(fileWith(OLD_PATTERN))
    await setRouteInSchemaFile(dir, 'post', NEW_PATTERN)

    expect(await setRouteInSchemaFile(dir, 'post', NEW_PATTERN)).toEqual({
      status: 'unchanged',
      pattern: NEW_PATTERN,
    })
  })

  it('refuses a pattern the collection cannot serve, before writing anything', async () => {
    const original = fileWith(OLD_PATTERN)
    const dir = await siteWith(original)

    // A segment that names no field.
    expect(await setRouteInSchemaFile(dir, 'post', '/blog/:nope/:slug')).toMatchObject({
      status: 'refused',
    })
    // A taxonomy field that takes several terms: a URL cannot name them all.
    expect(await setRouteInSchemaFile(dir, 'post', '/blog/:tags/:slug')).toMatchObject({
      status: 'refused',
    })
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(original)
  })

  it('names the collections it knows when asked for one it does not', async () => {
    const dir = await siteWith(fileWith(OLD_PATTERN))

    expect(await setRouteInSchemaFile(dir, 'nope', NEW_PATTERN)).toEqual({
      status: 'unknown-collection',
      known: collections.map((collection) => collection.name),
    })
  })

  it('leaves a schema that was written by hand in another shape untouched', async () => {
    const handWritten = `const post = { name: 'post', routing: { pattern: '/blog/:slug' }, fields: {}, permissions: {} }\nexport default [post]\n`
    const dir = await siteWith(handWritten)

    expect(await setRouteInSchemaFile(dir, 'post', NEW_PATTERN)).toEqual({
      status: 'skipped',
      reason: 'unknown-shape',
    })
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(handWritten)
  })
})

describe('cogenta schema set-route', () => {
  async function siteWithEntries(): Promise<string> {
    const dir = await siteWith(fileWith(OLD_PATTERN))
    await writeFile(
      join(dir, 'cogenta.config.mjs'),
      `export default {
  site: { name: 'Site', url: 'https://example.com', locales: ['fr'], defaultLocale: 'fr' },
  database: { driver: 'sqlite', url: ${JSON.stringify(join(dir, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(dir, 'cache'))} },
  storage: { path: ${JSON.stringify(join(dir, 'media'))} },
}
`,
      'utf8',
    )
    const selection = await createDatabaseRegistry({
      logger: createLogger({ level: 'silent' }),
    }).select({ driver: 'sqlite', url: join(dir, 'site.db') })
    try {
      await createSchemaTables(selection.instance, collections, taxonomies)
      const post = collections.find((collection) => collection.name === 'post')
      const categoryTaxonomy = taxonomies.find(
        (taxonomy) => taxonomy.name === post?.fields.category?.options.of,
      )
      if (post === undefined || categoryTaxonomy === undefined) {
        throw new Error('the blog has a post collection and a category taxonomy')
      }
      const term = await createTaxonomyStore({
        db: selection.instance,
        taxonomy: categoryTaxonomy,
      }).create({ slug: 'devops', labels: { fr: 'DevOps' } })
      const store = createContentStore({
        db: selection.instance,
        collection: post,
        defaultLocale: 'fr',
      })
      await store.create({
        status: 'published',
        values: { title: 'Bonjour', slug: 'bonjour', body: BODY, category: term.id },
      })
      await store.create({
        status: 'published',
        values: { title: 'Seul', slug: 'seul', body: BODY },
      })
    } finally {
      await selection.dispose()
    }
    return dir
  }

  async function run(
    dir: string,
    args: readonly string[],
    write = false,
  ): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
    let stdout = ''
    let stderr = ''
    const code = await runSchema({
      subcommand: 'set-route',
      args,
      cwd: dir,
      env: {},
      out: createOutput((text) => {
        stdout += text
      }, false),
      stderr: (text) => {
        stderr += text
      },
      ...(write ? { write: true } : {}),
    })
    return { code, stdout, stderr }
  }

  it('is a dry run unless asked to write, and names the addresses that move', async () => {
    const dir = await siteWithEntries()
    const before = await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')

    const result = await run(dir, ['post', NEW_PATTERN])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Dry run')
    expect(result.stdout).toContain('1 of 2 published entries change address')
    expect(result.stdout).toContain('/blog/bonjour -> /blog/devops/bonjour')
    // An entry with no category keeps its address.
    expect(result.stdout).not.toContain('/blog/seul')
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(before)
  })

  it('edits the file with --write', async () => {
    const dir = await siteWithEntries()

    const result = await run(dir, ['post', NEW_PATTERN], true)

    expect(result.code).toBe(0)
    expect(result.stdout).toContain(`post: ${OLD_PATTERN} -> ${NEW_PATTERN}`)
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(fileWith(NEW_PATTERN))
  })

  it('needs a collection and a pattern, and refuses a pattern the collection cannot serve', async () => {
    const dir = await siteWithEntries()

    expect((await run(dir, [])).code).toBe(2)
    expect((await run(dir, ['post'])).code).toBe(2)
    const refused = await run(dir, ['post', '/blog/:nope/:slug'], true)
    expect(refused.code).toBe(1)
    expect(refused.stderr).toContain('is refused')
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(fileWith(OLD_PATTERN))
  })
})
