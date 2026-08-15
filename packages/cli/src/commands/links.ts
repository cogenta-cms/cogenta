import { dirname, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import {
  createDatabaseRegistry,
  createLogger,
  isCogentaError,
  type Logger,
  loadConfig,
} from '@cogenta/core'
import {
  type BrokenLink,
  type CollectionDefinition,
  type ContentStore,
  checkLinks,
  createContentStore,
  createSchemaTables,
} from '@cogenta/schema'
import type { Output, Writer } from '../output.js'
import { loadCollections } from './serve.js'

export type LinksSubcommand = 'check'

export interface LinksOptions {
  readonly subcommand: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  /** Also follow `http(s)` links that leave the site. Off unless asked. */
  readonly external?: boolean
}

const USAGE = `Usage
  cogenta links check [--external]

Walks every published entry, follows every link it holds, and reports the ones
that lead nowhere: a reference to a deleted or still-unpublished entry, a
site-relative path that matches no route, and — with --external — an outside
URL that answers with an error or cannot be reached at all.

Nothing about this runs on its own. This project guarantees no durable
background worker (rule R1), so "periodically" means a cron entry calling this
command, not a scheduler pretending to exist inside the site.
`

const REASON_TEXT: Record<BrokenLink['reason'], string> = {
  unknown_collection: 'points at a collection this site does not have',
  target_missing: 'points at content that does not exist',
  target_unpublished: 'points at content that is not published',
  unroutable_path: 'is a path no route can serve',
  http_error: 'answered with an error status',
  unreachable: 'could not be reached',
}

function describe(broken: BrokenLink): string {
  const target =
    broken.link.kind === 'url' ? broken.link.href : `${broken.link.collection}/${broken.link.id}`
  const status = broken.status === undefined ? '' : ` (${broken.status})`
  return `${broken.collection}/${broken.entryId} [${broken.locale}] ${broken.at}\n    → ${target}${status} — ${REASON_TEXT[broken.reason]}`
}

/**
 * `cogenta links check` (L14 task 3).
 *
 * Exit codes are the ones a cron entry can act on: 0 nothing broken, 1 broken
 * links were found or the site could not be read, 2 the command line was
 * wrong. A non-zero exit for "found broken links" is deliberate — that is what
 * makes this usable as a CI or scheduled check rather than something whose
 * output somebody has to read.
 */
export async function runLinks(options: LinksOptions): Promise<number> {
  const { out, stderr } = options
  const env = options.env ?? process.env
  const logger = options.logger ?? createLogger({ level: 'silent' })

  if (options.subcommand === undefined) {
    stderr(`cogenta links needs a subcommand.\n\n${USAGE}`)
    return 2
  }
  if (options.subcommand !== 'check') {
    stderr(`Unknown subcommand "${options.subcommand}". Only "check" exists today.\n\n${USAGE}`)
    return 2
  }

  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })
  const projectRoot =
    loaded.path === null ? resolvePath(options.cwd ?? process.cwd()) : dirname(loaded.path)

  let selection: Awaited<ReturnType<ReturnType<typeof createDatabaseRegistry>['select']>> | null =
    null
  try {
    const collections = await loadCollections(projectRoot)
    selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
    const db = selection.instance
    await createSchemaTables(db, collections)

    const stores = new Map<string, ContentStore>()
    const storeFor = (collection: CollectionDefinition): ContentStore => {
      const existing = stores.get(collection.name)
      if (existing !== undefined) return existing
      const created = createContentStore({ db, collection })
      stores.set(collection.name, created)
      return created
    }

    const report = await checkLinks({
      collections,
      storeFor,
      locales: loaded.config.site.locales,
      defaultLocale: loaded.config.site.defaultLocale,
      ...(options.external === true ? { checkExternal: true } : {}),
    })

    if (report.broken.length === 0) {
      out.ok(
        `Checked ${report.checkedLinks} link(s) across ${report.checkedEntries} published entries. Nothing broken.`,
      )
      if (report.skippedExternal > 0) {
        out.detail(
          `${report.skippedExternal} external link(s) were not followed. Pass --external to check them.`,
        )
      }
      return 0
    }

    out.warn(
      `${report.broken.length} broken link(s) in ${report.checkedEntries} published entries:`,
    )
    for (const broken of report.broken) out.detail(describe(broken))
    if (report.skippedExternal > 0) {
      out.detail(
        `${report.skippedExternal} external link(s) were not followed. Pass --external to check them.`,
      )
    }
    return 1
  } catch (error) {
    if (isCogentaError(error)) {
      stderr(`${error.code}: ${error.message}\n`)
      if (error.hint !== undefined) stderr(`${error.hint}\n`)
    } else {
      stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
    return 1
  } finally {
    await selection?.instance.close()
  }
}
