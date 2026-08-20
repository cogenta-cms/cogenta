import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { createCommentStore, ensureCommentsTables } from '@cogenta/comments'
import {
  createDatabaseRegistry,
  createLogger,
  createStorageRegistry,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
  type StorageDriver,
} from '@cogenta/core'
import { formatConversionReport, importWordPress } from '@cogenta/import'
import type { Output, Writer } from '../output.js'

export type ImportSubcommand = 'wordpress'

export interface ImportOptions {
  readonly subcommand: string | undefined
  readonly file: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
}

const USAGE = `Usage
  cogenta import wordpress <file.xml>

Imports a WordPress "Export All Content" WXR file: posts, pages, categories,
tags, media, authors, comments and redirects. Prints a report of what could
not be converted — a partial import with a report is the expected outcome for
a real-world export, not a failure.
`

async function withSite<T>(
  options: ImportOptions,
  logger: Logger,
  use: (db: DatabaseHandle, storage: StorageDriver) => Promise<T>,
): Promise<T> {
  const env = options.env ?? process.env
  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })

  const dbSelection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  const storageSelection = await createStorageRegistry({ logger }).select(loaded.config.storage)
  try {
    return await use(dbSelection.instance, storageSelection.instance)
  } finally {
    await dbSelection.dispose()
  }
}

/**
 * Runs one `import` subcommand and returns its exit code.
 *
 * 0 the import ran, even with items reported as unconverted (that report *is*
 * success — see `formatConversionReport`'s own framing). 1 the file could not
 * be read or parsed at all, or the database refused. 2 the command line was
 * wrong.
 */
export async function runImport(options: ImportOptions): Promise<number> {
  const { out, stderr } = options

  if (options.subcommand === undefined) {
    stderr(`cogenta import needs a subcommand.\n\n${USAGE}`)
    return 2
  }
  if (options.subcommand !== 'wordpress') {
    stderr(`Unknown subcommand "${options.subcommand}".\n\n${USAGE}`)
    return 2
  }
  if (options.file === undefined || options.file.trim().length === 0) {
    stderr(`A file path is required.\n\n${USAGE}`)
    return 2
  }

  const logger = options.logger ?? createLogger({ level: 'silent' })

  let xml: string
  try {
    xml = await readFile(options.file, 'utf8')
  } catch (error) {
    stderr(
      `Could not read "${options.file}": ${error instanceof Error ? error.message : String(error)}\n`,
    )
    return 1
  }

  try {
    const report = await withSite(options, logger, async (db, storage) => {
      // Contract F (ADR-0025): the CLI always passes a real comment store —
      // `cogenta import wordpress` is the one caller of `importWordPress`
      // this project ships, and a WordPress export with comments deserves
      // to keep them with real status and threading, not the legacy
      // synthetic collection (`ImportWordPressOptions.comments`'s own
      // comment explains the fallback that exists only for a caller that
      // has not wired this yet).
      await ensureCommentsTables(db)
      const comments = createCommentStore({ db })
      return importWordPress(xml, { db, storage, comments })
    })

    out.heading('WordPress import')
    out.line(formatConversionReport(report))
    return 0
  } catch (error) {
    if (isCogentaError(error)) {
      stderr(`${error.code}: ${error.message}\n`)
      if (error.hint !== undefined) stderr(`${error.hint}\n`)
    } else {
      stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
    return 1
  }
}
