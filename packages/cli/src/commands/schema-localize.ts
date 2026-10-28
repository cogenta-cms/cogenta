import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  createDatabaseRegistry,
  createLogger,
  isCogentaError,
  type Logger,
  loadConfig,
} from '@cogenta/core'
import {
  buildPath,
  type CollectionDefinition,
  type ContentEntry,
  createContentStore,
} from '@cogenta/schema'
import type { Output, Writer } from '../output.js'
import { loadCollections } from './serve.js'

/**
 * `cogenta schema localize-routes` — brings the schema file of a site
 * scaffolded before multilingual routing to the shape a new scaffold has: on a site published in several languages,
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
 * It is an operator's command and nothing else: no server, bootstrap or
 * agent calls it. ADR-0010 keeps the schema read-only in production and
 * ADR-0023 refuses to let anything but the development pipeline write it, so
 * it is a dry run unless `--write` is given, and it is meant to be run on a
 * development copy of the site, the file committed and then deployed — the
 * same road as any other schema change.
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
  /** A dry run: the file would route these collections by locale. Nothing was written. */
  | {
      readonly status: 'would-update'
      readonly file: string
      readonly collections: readonly string[]
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
  options: { readonly dryRun?: boolean } = {},
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

  if (options.dryRun === true) {
    return {
      status: 'would-update',
      file,
      collections: before
        .filter((collection) => collection.routing?.locale !== true)
        .map((collection) => String(collection.name)),
    }
  }

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

export interface SchemaOptions {
  readonly subcommand: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  /** Edit the file. Without it the command only reports what it would do. */
  readonly write?: boolean
}

const USAGE = `Usage
  cogenta schema localize-routes [--write]

For a site published in several languages (site.locales in cogenta.config) whose
cogenta.schema.mjs was scaffolded before multilingual routing: serve every routed
collection under a locale prefix — the default language stays at its usual
addresses, the others move to /<locale>/…, exactly as a new scaffold does.

Without --write this is a dry run: it names the collections it would change and
prints the 301 redirects the move needs (the old unprefixed address of every
published entry in a non-default language, and where it goes). With --write it
edits cogenta.schema.mjs, keeping the original beside it as
cogenta.schema.mjs.before-locale-routing.

The schema is read-only in production (ADR-0010, ADR-0023): run this on a
development copy of the site, commit the file, deploy it, then add the printed
redirects in the admin (Redirections). Nothing calls this command for you.
`

/** The params a route pattern reads: the entry's string values. */
function routeParams(entry: ContentEntry): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entry.values).filter(
      (pair): pair is [string, string] => typeof pair[1] === 'string',
    ),
  )
}

/**
 * The address every published entry of a non-default language has today, and
 * the one it will have once the collection routes by locale.
 */
async function movedAddresses(
  collections: readonly CollectionDefinition[],
  config: {
    readonly db: Parameters<typeof createContentStore>[0]['db']
    readonly locales: readonly string[]
    readonly defaultLocale: string
  },
): Promise<readonly { readonly from: string; readonly to: string }[]> {
  const moved: { from: string; to: string }[] = []
  for (const collection of collections) {
    if (collection.routing === undefined || collection.routing.locale === true) continue
    const localised: CollectionDefinition = {
      ...collection,
      routing: { ...collection.routing, locale: true },
    }
    const store = createContentStore({
      db: config.db,
      collection,
      defaultLocale: config.defaultLocale,
    })
    for (const locale of config.locales) {
      if (locale === config.defaultLocale) continue
      let cursor: string | undefined
      do {
        const page = await store.list({
          locale,
          state: 'published',
          limit: 100,
          ...(cursor === undefined ? {} : { cursor }),
        })
        for (const entry of page.items) {
          try {
            const params = routeParams(entry)
            const from = buildPath(collection, params)
            const to = buildPath(localised, params, locale, { defaultLocale: config.defaultLocale })
            if (from !== to) moved.push({ from, to })
          } catch (error) {
            // An entry saved without its slug was never served; nothing to redirect.
            if (!isCogentaError(error) || error.code !== 'CONTENT_ROUTE_INVALID') throw error
          }
        }
        cursor = page.nextCursor ?? undefined
      } while (cursor !== undefined)
    }
  }
  return moved
}

/**
 * `cogenta schema` — only `localize-routes` exists. 0 done (or nothing to do).
 * 1 the site could not be read or the edit was undone. 2 the command line was wrong.
 */
export async function runSchema(options: SchemaOptions): Promise<number> {
  const { out, stderr } = options
  const env = options.env ?? process.env
  const logger = options.logger ?? createLogger({ level: 'silent' })

  if (options.subcommand === undefined) {
    stderr(`cogenta schema needs a subcommand.\n\n${USAGE}`)
    return 2
  }
  if (options.subcommand !== 'localize-routes') {
    stderr(`Unknown subcommand "${options.subcommand}". Only "localize-routes" exists.\n\n${USAGE}`)
    return 2
  }

  let selection: Awaited<ReturnType<ReturnType<typeof createDatabaseRegistry>['select']>> | null =
    null
  try {
    const loaded = await loadConfig({
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env,
    })
    const projectRoot =
      loaded.path === null ? resolvePath(options.cwd ?? process.cwd()) : dirname(loaded.path)
    const { locales, defaultLocale } = loaded.config.site

    const before = await loadCollections(projectRoot)
    const dryRun = options.write !== true
    const outcome = await localizeSchemaFile(projectRoot, locales, { dryRun })

    if (outcome.status === 'unchanged') {
      out.ok(`Nothing to change: ${outcome.reason.replace(/-/gu, ' ')}.`)
      return 0
    }
    if (outcome.status === 'skipped') {
      out.warn(
        outcome.reason === 'no-schema-file'
          ? 'No cogenta.schema.mjs in this project: nothing to change.'
          : 'cogenta.schema.mjs is not the file the installer wrote, so it was left alone. Add `locale: true` to each routing by hand.',
      )
      return 0
    }
    if (outcome.status === 'reverted') {
      stderr(`The edit did not load as expected and was undone: ${outcome.reason}\n`)
      return 1
    }

    if (outcome.status === 'updated') {
      out.ok(`${outcome.collections.join(', ')} now served by language (${locales.join('/')}).`)
      out.detail(`The previous file is kept as ${outcome.backup}.`)
    } else {
      out.detail(
        `Dry run: ${outcome.collections.join(', ')} would be served by language (${locales.join('/')}). Pass --write to edit the file.`,
      )
    }

    selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
    const moved = await movedAddresses(before, { db: selection.instance, locales, defaultLocale })
    if (moved.length === 0) {
      out.detail('No published entry in another language moves.')
    } else {
      out.warn(
        `${moved.length} published entr${moved.length === 1 ? 'y' : 'ies'} in another language move. Add these 301 redirects (admin, Redirections):`,
      )
      for (const { from, to } of moved) out.detail(`301 ${from} -> ${to}`)
    }
    return 0
  } catch (error) {
    if (isCogentaError(error)) {
      stderr(`${error.code}: ${error.message}\n`)
      if (error.hint !== undefined) stderr(`${error.hint}\n`)
    } else {
      stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
    return 1
  } finally {
    await selection?.dispose()
  }
}
