import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import process from 'node:process'
import {
  createCredentialStore,
  createPasswordResetStore,
  createSessionStore,
  createUserStore,
  ensureAuthTables,
} from '@cogenta/auth'
import { createEmailAdapter, createFileEmailTransport } from '@cogenta/channels'
import {
  createDatabaseRegistry,
  createLogger,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
} from '@cogenta/core'
import type { Output, Writer } from '../output.js'

export type UsersSubcommand = 'create' | 'reset-password'

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
  /** `reset-password`: the token from the mail, redeeming the reset. */
  readonly token?: string
  /** `reset-password`: the new password. Generated and printed once when absent. */
  readonly password?: string
  /** Where the outgoing mail is written. Defaults to `.cogenta/mail` under the project. */
  readonly mailDir?: string
}

const USAGE = `Usage
  cogenta users create --email <email> [--roles <role,role>] [--admin]
  cogenta users reset-password --email <email>
  cogenta users reset-password --token <token> [--password <password>]

The very first admin account is created this way — there is no other way in,
since the admin UI needs one to sign in to. A random password is generated and
printed once; it is never stored anywhere but the credential table's hash.

"reset-password --email" sends a single-use token, valid 30 minutes, to that
address. "reset-password --token" redeems it: the password is replaced and
every session opened with the old one is signed out.

Options
  --admin              Shorthand for --roles admin
  --password <text>    reset-password: the new password (generated if absent)
  --mail-dir <path>    Where the outgoing mail is written (default .cogenta/mail)
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

interface SiteInfo {
  readonly name: string
  readonly url: string
}

async function withDatabase<T>(
  options: UsersOptions,
  logger: Logger,
  use: (db: DatabaseHandle, site: SiteInfo) => Promise<T>,
): Promise<T> {
  const env = options.env ?? process.env
  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })

  const selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  try {
    return await use(selection.instance, {
      name: loaded.config.site.name,
      url: loaded.config.site.url,
    })
  } finally {
    await selection.dispose()
  }
}

/**
 * Sends the reset mail through `@cogenta/channels`, not through a second
 * mailer of this command's own — the email adapter and its transport
 * interface already exist and are the project's one way out.
 *
 * The transport is the file one, because it is the only one that exists: a
 * real SMTP transport is a documented, deliberate gap in that package
 * (`providers/email/transport.ts`). So this writes a real message to a real
 * file and says exactly where, rather than pretending mail left the machine.
 */
async function sendResetMail(
  options: UsersOptions,
  site: SiteInfo,
  address: string,
  token: string,
  expiresAt: string,
): Promise<string> {
  const directory = options.mailDir ?? resolve(options.cwd ?? process.cwd(), '.cogenta', 'mail')

  const adapter = createEmailAdapter({
    transport: createFileEmailTransport({ directory }),
  })

  // `report` of the three fixed message levels: `notification` is one line
  // with nowhere to put a token, and `alert` would stamp "[WARNING]" on the
  // subject and demand an incident's `expectedAction`/`adminUrl`. None of the
  // three was designed for transactional mail; a fourth level would change a
  // closed union every one of the five adapters renders, for one caller.
  await adapter.send(
    { id: address },
    {
      level: 'report',
      title: `${site.name} — password reset`,
      keyFigures: [
        { label: 'Valid until', value: expiresAt },
        { label: 'Uses left', value: '1' },
      ],
      sections: [
        {
          heading: 'Your one-time token',
          body: token,
        },
        {
          heading: 'How to use it',
          body: `Run: cogenta users reset-password --token ${token}\n\nThe token works once and expires at ${expiresAt}. If you did not ask for this, ignore this message — the token is useless without it, and asking again replaces it.`,
        },
      ],
    },
  )

  return directory
}

async function issueReset(options: UsersOptions, logger: Logger): Promise<number> {
  const { out, stderr } = options
  const address = options.email as string

  return withDatabase(options, logger, async (db, site) => {
    await ensureAuthTables(db)
    const users = createUserStore(db)
    const user = await users.byEmail(address)

    if (user === null) {
      // An administrator at a terminal is not an anonymous form on the public
      // internet: telling them the address is unknown is the useful answer. An
      // HTTP route added later must NOT copy this — there, the same honesty is
      // account enumeration.
      stderr(`AUTH_USER_NOT_FOUND: No account for ${address}.\n`)
      stderr('Check the address, or create the account with `cogenta users create`.\n')
      return 1
    }

    const resets = createPasswordResetStore(db)
    const issued = await resets.issue(user.id)
    const directory = await sendResetMail(options, site, user.email, issued.token, issued.expiresAt)

    out.heading('Password reset sent')
    out.ok(`${user.email} — valid until ${issued.expiresAt}`)
    out.line()
    out.warn(`No SMTP transport exists yet, so the message was written to ${directory}`)
    out.detail('Deliver it yourself, or read the token from that file.')
    out.detail('Any reset previously sent to this account no longer works.')
    return 0
  })
}

async function redeemReset(options: UsersOptions, logger: Logger): Promise<number> {
  const { out, stderr } = options
  const token = options.token as string
  const password = options.password ?? generatePassword()
  const chosen = options.password !== undefined

  return withDatabase(options, logger, async (db) => {
    await ensureAuthTables(db)
    const resets = createPasswordResetStore(db)
    const outcome = await resets.redeem(token)

    if (outcome.kind !== 'ready') {
      const reason = {
        invalid: 'This reset token does not exist.',
        expired: 'This reset token has expired.',
        used: 'This reset token has already been used.',
      }[outcome.kind]
      stderr(`AUTH_RESET_TOKEN_REFUSED: ${reason}\n`)
      stderr('Ask for a new one with `cogenta users reset-password --email <email>`.\n')
      return 1
    }

    const users = createUserStore(db)
    const user = await users.byId(outcome.userId)
    if (user === null) {
      stderr(`AUTH_USER_NOT_FOUND: The account this token belonged to no longer exists.\n`)
      return 1
    }

    await createCredentialStore(db).setPassword(user.id, password)
    // Whoever knew the old password may still hold a live session, and a reset
    // that leaves them signed in has reset nothing. This is the reason the
    // reset is composed here rather than being a single store call: the store
    // owns tokens, not sessions.
    await createSessionStore(db).revokeAll(user.id)

    out.heading('Password reset')
    out.ok(`${user.email} — every existing session was signed out`)
    if (!chosen) {
      out.line()
      out.line(`Password: ${password}`)
      out.line()
      out.warn('This password is shown once. It is stored only as a salted hash.')
    }
    return 0
  })
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
  if (options.subcommand !== 'create' && options.subcommand !== 'reset-password') {
    stderr(`Unknown subcommand "${options.subcommand}".\n\n${USAGE}`)
    return 2
  }

  const logger = options.logger ?? createLogger({ level: 'silent' })

  if (options.subcommand === 'reset-password') {
    const hasEmail = options.email !== undefined && options.email.trim().length > 0
    const hasToken = options.token !== undefined && options.token.trim().length > 0

    if (hasEmail === hasToken) {
      stderr(
        `reset-password takes either --email (to send a token) or --token (to redeem one), not both and not neither.\n\n${USAGE}`,
      )
      return 2
    }
    if (options.password !== undefined && !hasToken) {
      stderr(`--password only means something together with --token.\n\n${USAGE}`)
      return 2
    }

    try {
      return hasToken ? await redeemReset(options, logger) : await issueReset(options, logger)
    } catch (error) {
      return reportFailure(stderr, error)
    }
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
        'Sign in with it straight away — a second factor is recommended for a role that can publish, or admin, but never demanded at sign-in (ADR-0021). Turn it on from the profile screen in the admin.',
      )
      return 0
    })
  } catch (error) {
    return reportFailure(stderr, error)
  }
}

function reportFailure(stderr: Writer, error: unknown): number {
  if (isCogentaError(error)) {
    stderr(`${error.code}: ${error.message}\n`)
    if (error.hint !== undefined) stderr(`${error.hint}\n`)
  } else {
    stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
  }
  return 1
}
