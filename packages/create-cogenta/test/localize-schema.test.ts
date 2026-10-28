import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contentPackFor } from '@cogenta/starters'
import { afterEach, describe, expect, it } from 'vitest'
import { localizeSchemaFile } from '../src/localize-schema.js'

/**
 * A site scaffolded before multilingual routing keeps its `cogenta.schema.mjs`
 * on its volume across an image upgrade. `localizeSchemaFile` brings it to the
 * shape a new bilingual scaffold has, and does so safely: same result as a
 * fresh scaffold, idempotent, backed up, and never touching a file it does not
 * recognise.
 */

const dirs: string[] = []

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
