import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Brings the schema file of a site scaffolded before multilingual routing to
 * the shape a new scaffold has: on a site published in several languages,
 * every routed collection is served under a locale prefix.
 *
 * `cogenta.schema.mjs` is the file `scaffoldSite` wrote — a JSON array, one
 * `"routing": { "pattern": … }` object per routed collection — so the change
 * is a text edit of that known shape, never a rewrite of the whole file, and a
 * file that has been rewritten by hand into another shape is left untouched
 * and reported. The edit is idempotent (a collection that already carries
 * `"locale": true` is not matched again), checked by loading the result, and
 * undone on any doubt.
 *
 * What it changes for the site: the default language stays at its unprefixed
 * URLs, and an entry in another language is served at `/<locale>/…` instead of
 * at the unprefixed address it could only be reached at before. It writes no
 * content — a translation that does not exist yet is still to be written.
 */

export type LocalizeSchemaOutcome =
  /** The file now routes by locale. */
  | {
      readonly status: 'updated'
      readonly file: string
      readonly collections: readonly string[]
      readonly backup: string
    }
  /** Nothing to do: one language, no routed collection, or already localised. */
  | {
      readonly status: 'unchanged'
      readonly reason: 'single-language' | 'already-localised' | 'no-routed-collection'
    }
  /** The file is not one this edit knows how to change. */
  | { readonly status: 'skipped'; readonly reason: 'no-schema-file' | 'unknown-shape' }
  /** The edit did not load as expected and was undone. */
  | { readonly status: 'reverted'; readonly reason: string }

const SCHEMA_FILE = 'cogenta.schema.mjs'
const BACKUP_SUFFIX = '.before-locale-routing'

/** `"routing": {` + `"pattern": "…"` + `}` and nothing between: a routing object without `locale`. */
const ROUTING_WITHOUT_LOCALE = /("routing": \{\n(\s*)"pattern": "(?:[^"\\\n]|\\.)*")(\n\s*\})/gu

interface LoadedCollection {
  readonly name?: unknown
  readonly routing?: { readonly locale?: unknown }
}

async function routedCollections(file: string): Promise<readonly LoadedCollection[]> {
  // A query string so a second load in the same process is not served from the module cache.
  const loaded = (await import(`${pathToFileURL(file).href}?check=${Date.now()}`)) as {
    readonly default?: unknown
  }
  if (!Array.isArray(loaded.default)) throw new TypeError('the default export is not an array')
  return (loaded.default as readonly LoadedCollection[]).filter(
    (collection) => collection.routing !== undefined,
  )
}

export async function localizeSchemaFile(
  siteDir: string,
  locales: readonly string[],
): Promise<LocalizeSchemaOutcome> {
  if (new Set(locales).size < 2) return { status: 'unchanged', reason: 'single-language' }

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
    before = await routedCollections(file)
  } catch {
    return { status: 'skipped', reason: 'unknown-shape' }
  }
  if (before.length === 0) return { status: 'unchanged', reason: 'no-routed-collection' }
  if (before.every((collection) => collection.routing?.locale === true)) {
    return { status: 'unchanged', reason: 'already-localised' }
  }

  const edited = source.replace(ROUTING_WITHOUT_LOCALE, '$1,\n$2"locale": true$3')
  if (edited === source) return { status: 'skipped', reason: 'unknown-shape' }

  const backup = `${file}${BACKUP_SUFFIX}`
  await copyFile(file, backup)
  await writeFile(file, edited, 'utf8')
  try {
    const after = await routedCollections(file)
    if (after.length !== before.length || !after.every((c) => c.routing?.locale === true)) {
      throw new TypeError('a routed collection is still not served by locale')
    }
    return {
      status: 'updated',
      file,
      collections: after.map((collection) => String(collection.name)),
      backup,
    }
  } catch (error) {
    await copyFile(backup, file)
    return { status: 'reverted', reason: error instanceof Error ? error.message : String(error) }
  }
}
