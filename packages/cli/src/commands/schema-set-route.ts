import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineCollection } from '@cogenta/schema'

/**
 * `cogenta schema set-route <collection> "<pattern>" [--write]` — gives a
 * collection of an existing site another URL pattern, typically to put the
 * category in the address of its entries (`/blog/:slug` ->
 * `/blog/:category/:slug`, `schema@2.5`).
 *
 * It is `localize-routes`' sibling and keeps its discipline (ADR-0010,
 * ADR-0023): an operator's command that edits one known shape of text in
 * `cogenta.schema.mjs` and nothing else, a dry run unless `--write` is given,
 * the original kept beside the result, and the edit undone when the file no
 * longer loads or the new pattern is refused by `defineCollection`. It writes
 * no content and no redirect: once the schema is deployed, the site answers
 * every address an entry had before with a 301 to its new one.
 */

export type SetRouteOutcome =
  | {
      readonly status: 'updated'
      readonly file: string
      readonly collection: string
      readonly from: string
      readonly to: string
      readonly backup: string
    }
  | {
      readonly status: 'would-update'
      readonly file: string
      readonly collection: string
      readonly from: string
      readonly to: string
    }
  | { readonly status: 'unchanged'; readonly pattern: string }
  | { readonly status: 'skipped'; readonly reason: 'no-schema-file' | 'unknown-shape' }
  | { readonly status: 'unknown-collection'; readonly known: readonly string[] }
  | { readonly status: 'no-route'; readonly collection: string }
  /** The new pattern, or the edited file, is not valid; nothing was changed. */
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'reverted'; readonly reason: string }

const SCHEMA_FILE = 'cogenta.schema.mjs'
const BACKUP_SUFFIX = '.before-set-route'

interface LoadedCollection {
  readonly name?: unknown
  readonly routing?: { readonly pattern?: unknown; readonly locale?: unknown }
}

async function loadArray(file: string): Promise<readonly LoadedCollection[]> {
  // A query string so a second load in the same process is not served from the module cache.
  const loaded = (await import(`${pathToFileURL(file).href}?check=${Date.now()}`)) as {
    readonly default?: unknown
  }
  if (!Array.isArray(loaded.default)) throw new TypeError('the default export is not an array')
  return loaded.default as readonly LoadedCollection[]
}

/** The slice of `source` holding one collection, in the layout `JSON.stringify(…, null, 2)` gives an array. */
function sliceOf(source: string, name: string): { start: number; end: number } | null {
  const opening = `\n  {\n    "name": ${JSON.stringify(name)},`
  const at = source.indexOf(opening)
  if (at === -1) return null
  const end = source.indexOf('\n  }', at + opening.length)
  return end === -1 ? null : { start: at, end }
}

const PATTERN_LINE = /("routing": \{\n\s*"pattern": )"(?:[^"\\\n]|\\.)*"/u

export async function setRouteInSchemaFile(
  siteDir: string,
  collectionName: string,
  pattern: string,
  options: { readonly dryRun?: boolean } = {},
): Promise<SetRouteOutcome> {
  const file = join(siteDir, SCHEMA_FILE)
  let source: string
  try {
    source = await readFile(file, 'utf8')
  } catch {
    return { status: 'skipped', reason: 'no-schema-file' }
  }
  if (!source.startsWith('export default [')) return { status: 'skipped', reason: 'unknown-shape' }

  let before: readonly LoadedCollection[]
  try {
    before = await loadArray(file)
  } catch {
    return { status: 'skipped', reason: 'unknown-shape' }
  }
  const target = before.find((collection) => collection.name === collectionName)
  if (target === undefined) {
    return { status: 'unknown-collection', known: before.map((c) => String(c.name)) }
  }
  const current = target.routing?.pattern
  if (typeof current !== 'string') return { status: 'no-route', collection: collectionName }
  if (current === pattern) return { status: 'unchanged', pattern }

  // The new pattern has to be one `defineCollection` accepts for this very
  // collection: a `:category` that names no field is refused here, before a
  // single byte is written.
  try {
    defineCollection({
      ...(target as Parameters<typeof defineCollection>[0]),
      routing: { pattern, ...(target.routing?.locale === true ? { locale: true } : {}) },
    })
  } catch (error) {
    return { status: 'refused', reason: error instanceof Error ? error.message : String(error) }
  }

  const slice = sliceOf(source, collectionName)
  if (slice === null) return { status: 'skipped', reason: 'unknown-shape' }
  const block = source.slice(slice.start, slice.end)
  if (!PATTERN_LINE.test(block)) return { status: 'skipped', reason: 'unknown-shape' }
  const edited = `${source.slice(0, slice.start)}${block.replace(
    PATTERN_LINE,
    (_, head: string) => `${head}${JSON.stringify(pattern)}`,
  )}${source.slice(slice.end)}`

  if (options.dryRun === true) {
    return { status: 'would-update', file, collection: collectionName, from: current, to: pattern }
  }

  const backup = `${file}${BACKUP_SUFFIX}`
  await copyFile(file, backup)
  await writeFile(file, edited, 'utf8')
  try {
    const after = await loadArray(file)
    const found = after.find((collection) => collection.name === collectionName)
    if (after.length !== before.length || found?.routing?.pattern !== pattern) {
      throw new TypeError('the collection does not carry the new pattern')
    }
    return {
      status: 'updated',
      file,
      collection: collectionName,
      from: current,
      to: pattern,
      backup,
    }
  } catch (error) {
    await copyFile(backup, file)
    return { status: 'reverted', reason: error instanceof Error ? error.message : String(error) }
  }
}
