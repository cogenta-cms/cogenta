import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import {
  createDatabaseRegistry,
  createLogger,
  isCogentaError,
  type Logger,
  loadConfig,
} from '@cogenta/core'
import { createRolePermissionStore, serialiseRolePermissionExport } from '@cogenta/schema'
import type { Output, Writer } from '../output.js'
import { loadSchemaModule } from './serve.js'

/**
 * `cogenta roles export` — fiche 63, task 3's last requirement: freeze the
 * `cogenta_role_permissions` table's current state into a file a site can
 * commit to git, for a site that wants to be able to return to an entirely
 * versioned source. The file is a snapshot, never a second thing
 * `PermissionLayer` reads — see `role-permission-export.ts`'s own comment.
 */

export type RolesSubcommand = 'export'

export interface RolesOptions {
  readonly subcommand: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  /** `export` only: where to write the file. Defaults to `cogenta.role-permissions.json` at the project root. */
  readonly file?: string
}

const DEFAULT_EXPORT_FILE = 'cogenta.role-permissions.json'

const USAGE = `Usage
  cogenta roles export [--out <path>]   Freeze the role permission override table into a file

Reads every row an admin has written from the appearance-of-permissions
screen (or a previous "roles export") and writes it as JSON — a
point-in-time copy for a site that wants its permission overrides versioned
in git too, alongside cogenta.schema.*. Re-running this command overwrites
the file with the table's current state; it never writes back to the table.
`

function reportCogentaError(error: unknown, stderr: Writer): void {
  if (isCogentaError(error)) {
    stderr(`${error.code}: ${error.message}\n`)
    if (error.hint !== undefined) stderr(`${error.hint}\n`)
  } else {
    stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
  }
}

async function runExport(options: RolesOptions): Promise<number> {
  const { out, stderr } = options
  const env = options.env ?? process.env
  const logger = options.logger ?? createLogger()

  let projectRoot: string
  let loaded: Awaited<ReturnType<typeof loadConfig>>
  try {
    loaded = await loadConfig({
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env,
    })
    projectRoot = loaded.path === null ? (options.cwd ?? process.cwd()) : dirname(loaded.path)
  } catch (error) {
    reportCogentaError(error, stderr)
    return 1
  }

  const selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  try {
    const { collections, taxonomies } = await loadSchemaModule(projectRoot)
    const store = createRolePermissionStore({ db: selection.instance, collections, taxonomies })
    const records = await store.list()
    const document = serialiseRolePermissionExport(records)

    const path = options.file ?? join(projectRoot, DEFAULT_EXPORT_FILE)
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, 'utf8')

    out.heading('Role permission overrides exported')
    out.ok(`${records.length} override${records.length === 1 ? '' : 's'} written to ${path}`)
    if (records.length === 0) {
      out.detail(
        'The database table holds no override yet — every role permission is still read from cogenta.schema.*.',
      )
    }
    return 0
  } catch (error) {
    reportCogentaError(error, stderr)
    return 1
  } finally {
    await selection.dispose()
  }
}

export async function runRoles(options: RolesOptions): Promise<number> {
  const { subcommand, out, stderr } = options

  if (subcommand === undefined) {
    out.line(USAGE)
    return 0
  }

  if (subcommand === 'export') return runExport(options)

  stderr(`Unknown "cogenta roles" subcommand: "${subcommand}".\n`)
  out.line(USAGE)
  return 2
}
