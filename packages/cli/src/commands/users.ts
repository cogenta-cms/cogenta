import { randomBytes } from 'node:crypto'
import process from 'node:process'
import { createCredentialStore, createUserStore, ensureAuthTables } from '@cogenta/auth'
import {
  createDatabaseRegistry,
  createLogger,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
} from '@cogenta/core'
import type { Output, Writer } from '../output.js'

export type UsersSubcommand = 'create'

export interface UsersOptions {
  readonly subcommand: string | undefined
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  readonly email?: string
  readonly roles?: string
  readonly admin?: boolean
}

const USAGE = `Usage
  cogenta users create --email <email> [--roles <role,role>] [--admin]

The very first admin account is created this way — there is no other way in,
since the admin UI needs one to sign in to. A random password is generated and
printed once; it is never stored anywhere but the credential table's hash.

Options
  --admin   Shorthand for --roles admin
`

/** Base64url, so it is safe to read off a terminal and paste back with no escaping. */
function generatePassword(): string {
  return randomBytes(24).toString('base64url')
}

function parseRoles(options: UsersOptions): string[] | { error: string } {
  if (options.admin === true && options.roles !== undefined) {
    return { error: '--admin and --roles are mutually exclusive — --admin already means admin.' }
  }
  if (options.admin === true) return ['admin']
  if (options.roles === undefined) {
    return { error: 'Name at least one role with --roles, or pass --admin for the first account.' }
  }
  const roles = options.roles
    .split(',')
    .map((role) => role.trim())
    .filter((role) => role.length > 0)
  if (roles.length === 0) {
    return { error: '--roles was given but named no role.' }
  }
  return roles
}

async function withDatabase<T>(
  options: UsersOptions,
  logger: Logger,
  use: (db: DatabaseHandle) => Promise<T>,
): Promise<T> {
  const env = options.env ?? process.env
  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })

  const selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  try {
    return await use(selection.instance)
  } finally {
    await selection.dispose()
  }
}

/**
 * Runs one `users` subcommand and returns its exit code.
 *
 * 0 succeeded, 1 the database or the store said no, 2 the command line was
 * wrong — same convention as `migrate` and `doctor`.
 */
export async function runUsers(options: UsersOptions): Promise<number> {
  const { out, stderr } = options

  if (options.subcommand === undefined) {
    stderr(`cogenta users needs a subcommand.\n\n${USAGE}`)
    return 2
  }
  if (options.subcommand !== 'create') {
    stderr(`Unknown subcommand "${options.subcommand}".\n\n${USAGE}`)
    return 2
  }
  if (options.email === undefined || options.email.trim().length === 0) {
    stderr(`--email is required.\n\n${USAGE}`)
    return 2
  }

  const roles = parseRoles(options)
  if ('error' in roles) {
    stderr(`${roles.error}\n\n${USAGE}`)
    return 2
  }

  const logger = options.logger ?? createLogger({ level: 'silent' })
  const password = generatePassword()

  try {
    return await withDatabase(options, logger, async (db) => {
      await ensureAuthTables(db)
      const users = createUserStore(db)
      const credentials = createCredentialStore(db)

      const user = await users.create({ email: options.email as string, roles })
      await credentials.setPassword(user.id, password)

      out.heading('User created')
      out.ok(`${user.email} — ${user.roles.join(', ')}`)
      out.line()
      out.line(`Password: ${password}`)
      out.line()
      out.warn('This password is shown once. It is stored only as a salted hash.')
      out.detail(
        'A role that can publish, or admin, will be asked to set up a second factor at first sign-in.',
      )
      return 0
    })
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
