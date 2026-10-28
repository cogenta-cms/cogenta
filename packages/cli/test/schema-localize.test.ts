import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore, createSchemaTables } from '@cogenta/schema'
import { contentPackFor } from '@cogenta/starters'
import { afterEach, describe, expect, it } from 'vitest'
import { localizeSchemaFile, runSchema } from '../src/commands/schema-localize.js'
import { createOutput } from '../src/output.js'

/**
 * A site scaffolded before multilingual routing keeps its `cogenta.schema.mjs`
 * on its volume across an image upgrade; an operator brings it up to date with
 * `cogenta schema localize-routes`, never a server or a bootstrap (ADR-0010, ADR-0023). `localizeSchemaFile` brings it to the
 * shape a new bilingual scaffold has, and does so safely: same result as a
 * fresh scaffold, idempotent, backed up, and never touching a file it does not
 * recognise.
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

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function siteWith(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cogenta-localize-schema-'))
  dirs.push(dir)
  await writeFile(join(dir, 'cogenta.schema.mjs'), source, 'utf8')
  return dir
}

/** What `scaffoldSite` wrote for a blog before this change. */
function scaffoldedFile(locale: string, locales: readonly string[]): string {
  const collections = contentPackFor('blog', locale, locales)?.collections ?? []
  return `export default ${JSON.stringify(collections, null, 2)}\n`
}

describe('localizeSchemaFile', () => {
  it('turns the schema of a single-language scaffold into the one a bilingual scaffold writes', async () => {
    const dir = await siteWith(scaffoldedFile('fr', ['fr']))

    const outcome = await localizeSchemaFile(dir, ['fr', 'en'])

    expect(outcome).toMatchObject({ status: 'updated', collections: ['post', 'page'] })
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(
      scaffoldedFile('fr', ['fr', 'en']),
    )
  })

  it('keeps the file it started from', async () => {
    const original = scaffoldedFile('fr', ['fr'])
    const dir = await siteWith(original)

    await localizeSchemaFile(dir, ['fr', 'en'])

    expect(await readFile(join(dir, 'cogenta.schema.mjs.before-locale-routing'), 'utf8')).toBe(
      original,
    )
  })

  it('does nothing the second time', async () => {
    const dir = await siteWith(scaffoldedFile('fr', ['fr']))
    await localizeSchemaFile(dir, ['fr', 'en'])
    const once = await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')

    expect(await localizeSchemaFile(dir, ['fr', 'en'])).toEqual({
      status: 'unchanged',
      reason: 'already-localised',
    })
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(once)
  })

  it('leaves a site with one language alone', async () => {
    const original = scaffoldedFile('fr', ['fr'])
    const dir = await siteWith(original)

    expect(await localizeSchemaFile(dir, ['fr'])).toEqual({
      status: 'unchanged',
      reason: 'single-language',
    })
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(original)
    await expect(stat(join(dir, 'cogenta.schema.mjs.before-locale-routing'))).rejects.toThrow()
  })

  it('leaves a schema that was written by hand in another shape untouched', async () => {
    const handWritten = `const post = { name: 'post', routing: { pattern: '/blog/:slug' }, fields: {}, permissions: {} }\nexport default [post]\n`
    const dir = await siteWith(handWritten)

    expect(await localizeSchemaFile(dir, ['fr', 'en'])).toEqual({
      status: 'skipped',
      reason: 'unknown-shape',
    })
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(handWritten)
  })

  it('reports a site that has no such schema file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-localize-schema-'))
    dirs.push(dir)

    expect(await localizeSchemaFile(dir, ['fr', 'en'])).toEqual({
      status: 'skipped',
      reason: 'no-schema-file',
    })
  })

  it('has nothing to do for a site without a routed collection', async () => {
    const dir = await siteWith('export default []\n')

    expect(await localizeSchemaFile(dir, ['fr', 'en'])).toEqual({
      status: 'unchanged',
      reason: 'no-routed-collection',
    })
  })
})

describe('cogenta schema localize-routes', () => {
  async function siteWithEntries(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-schema-command-'))
    dirs.push(dir)
    const source = scaffoldedFile('fr', ['fr'])
    await writeFile(join(dir, 'cogenta.schema.mjs'), source, 'utf8')
    await writeFile(
      join(dir, 'cogenta.config.mjs'),
      `export default {
  site: { name: 'Site', url: 'https://example.com', locales: ['fr', 'en'], defaultLocale: 'fr' },
  database: { driver: 'sqlite', url: ${JSON.stringify(join(dir, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(dir, 'cache'))} },
  storage: { path: ${JSON.stringify(join(dir, 'media'))} },
}
`,
      'utf8',
    )
    const collections = contentPackFor('blog', 'fr', ['fr'])?.collections ?? []
    const selection = await createDatabaseRegistry({
      logger: createLogger({ level: 'silent' }),
    }).select({ driver: 'sqlite', url: join(dir, 'site.db') })
    try {
      await createSchemaTables(
        selection.instance,
        collections,
        contentPackFor('blog', 'fr', ['fr'])?.taxonomies ?? [],
      )
      const post = collections.find((collection) => collection.name === 'post')
      if (post === undefined) throw new Error('the blog has a post collection')
      const store = createContentStore({
        db: selection.instance,
        collection: post,
        defaultLocale: 'fr',
      })
      const french = await store.create({
        status: 'published',
        values: { title: 'Bonjour', slug: 'bonjour', body: BODY },
      })
      await store.create({
        locale: 'en',
        translationOf: french.id,
        status: 'published',
        values: { title: 'Hello', slug: 'hello', body: BODY },
      })
    } finally {
      await selection.dispose()
    }
    return dir
  }

  async function run(
    dir: string,
    subcommand: string | undefined,
    write = false,
  ): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
    let stdout = ''
    let stderr = ''
    const code = await runSchema({
      subcommand,
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

  it('is a dry run unless asked to write: it edits nothing and lists the redirects the move needs', async () => {
    const dir = await siteWithEntries()
    const before = await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')

    const result = await run(dir, 'localize-routes')

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Dry run')
    expect(result.stdout).toContain('301 /blog/hello -> /en/blog/hello')
    expect(result.stdout).not.toContain('/blog/bonjour')
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(before)
  })

  it('edits the file with --write and still names the redirects', async () => {
    const dir = await siteWithEntries()

    const result = await run(dir, 'localize-routes', true)

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('301 /blog/hello -> /en/blog/hello')
    expect(await readFile(join(dir, 'cogenta.schema.mjs'), 'utf8')).toBe(
      scaffoldedFile('fr', ['fr', 'en']),
    )
  })

  it('refuses a subcommand it does not have', async () => {
    const dir = await siteWithEntries()
    expect((await run(dir, 'apply')).code).toBe(2)
    expect((await run(dir, undefined)).code).toBe(2)
  })
})
