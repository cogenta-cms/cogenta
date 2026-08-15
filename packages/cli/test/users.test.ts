import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, sql } from '@cogenta/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { run } from '../src/index.js'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-users-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  return root
}

let out: string[]
let err: string[]
const stdout = (text: string): void => {
  out.push(text)
}
const stderr = (text: string): void => {
  err.push(text)
}
const output = (): string => out.join('')
const errors = (): string => err.join('')

beforeEach(() => {
  out = []
  err = []
})

const users = (root: string, ...args: string[]): Promise<number> =>
  run({ argv: ['users', ...args, '--cwd', root], stdout, stderr, env: {} })

describe('users create', () => {
  it('creates an admin account with --admin and prints a one-time password', async () => {
    const root = await project()
    expect(await users(root, 'create', '--email', 'admin@example.com', '--admin')).toBe(0)

    expect(output()).toContain('admin@example.com — admin')
    expect(output()).toMatch(/Password: \S+/)

    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const rows = await db.query<{ email: string; roles: string }>(
      sql`select email, roles from cogenta_users`,
    )
    expect(rows.rows).toEqual([{ email: 'admin@example.com', roles: '["admin"]' }])
    await db.close()
  })

  it('creates a user with named roles', async () => {
    const root = await project()
    expect(
      await users(root, 'create', '--email', 'ed@example.com', '--roles', 'editor,reviewer'),
    ).toBe(0)
    expect(output()).toContain('ed@example.com — editor, reviewer')
  })

  it('sets a password that later verifies, not a placeholder', async () => {
    const root = await project()
    await users(root, 'create', '--email', 'admin@example.com', '--admin')
    const password = /Password: (\S+)/.exec(output())?.[1]
    expect(password).toBeTruthy()

    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const { createCredentialStore } = await import('@cogenta/auth')
    const credentials = createCredentialStore(db)
    const userRow = await db.query<{ id: string }>(sql`select id from cogenta_users limit 1`)
    const userId = userRow.rows[0]?.id
    expect(userId).toBeTruthy()
    expect(await credentials.verifyPassword(userId as string, password as string)).toBe(true)
    await db.close()
  })

  it('refuses a second user with the same email', async () => {
    const root = await project()
    await users(root, 'create', '--email', 'dup@example.com', '--admin')
    expect(await users(root, 'create', '--email', 'dup@example.com', '--admin')).toBe(1)
    expect(errors()).toContain('AUTH_USER_EXISTS')
  })

  it('requires --email', async () => {
    const root = await project()
    expect(await users(root, 'create', '--admin')).toBe(2)
    expect(errors()).toContain('--email is required')
  })

  it('requires --roles or --admin', async () => {
    const root = await project()
    expect(await users(root, 'create', '--email', 'nobody@example.com')).toBe(2)
    expect(errors()).toContain('--roles')
  })

  it('refuses --admin together with --roles', async () => {
    const root = await project()
    expect(
      await users(root, 'create', '--email', 'nobody@example.com', '--admin', '--roles', 'editor'),
    ).toBe(2)
    expect(errors()).toContain('mutually exclusive')
  })

  it('rejects an unknown subcommand', async () => {
    const root = await project()
    expect(await users(root, 'delete')).toBe(2)
    expect(errors()).toContain('Unknown subcommand')
  })

  it('requires a subcommand', async () => {
    const root = await project()
    expect(await users(root)).toBe(2)
    expect(errors()).toContain('needs a subcommand')
  })
})

/**
 * Password reset (L13 task 6). Before this there was no way back into an
 * account whose password was forgotten: `users create` was the only account
 * command, so the recovery procedure was "have an administrator make you a
 * second account".
 */
describe('users reset-password', () => {
  /** The one-time token, read out of the message the file transport wrote. */
  async function tokenFromMail(root: string): Promise<string> {
    const directory = join(root, '.cogenta', 'mail')
    const files = await readdir(directory)
    expect(files).toHaveLength(1)
    const contents = await readFile(join(directory, files[0] as string), 'utf8')
    const token = /--token (\S+)/.exec(contents)?.[1]
    expect(token).toBeTruthy()
    return token as string
  }

  async function accountWithReset(root: string): Promise<string> {
    await users(root, 'create', '--email', 'forgetful@example.com', '--admin')
    out = []
    expect(await users(root, 'reset-password', '--email', 'forgetful@example.com')).toBe(0)
    return tokenFromMail(root)
  }

  it('writes a real message carrying a single-use token, and says where it went', async () => {
    const root = await project()
    await users(root, 'create', '--email', 'forgetful@example.com', '--admin')
    out = []

    expect(await users(root, 'reset-password', '--email', 'forgetful@example.com')).toBe(0)
    expect(output()).toContain('Password reset sent')
    // Honest about the one transport that exists, rather than claiming it was
    // posted somewhere.
    expect(output()).toContain('No SMTP transport exists yet')

    const contents = await readFile(
      join(root, '.cogenta', 'mail', (await readdir(join(root, '.cogenta', 'mail')))[0] as string),
      'utf8',
    )
    expect(contents).toContain('To: forgetful@example.com')
    expect(contents).toContain('password reset')
  })

  it('never prints the token to the terminal — the mail is the only place it exists', async () => {
    const root = await project()
    await users(root, 'create', '--email', 'forgetful@example.com', '--admin')
    out = []

    await users(root, 'reset-password', '--email', 'forgetful@example.com')
    const token = await tokenFromMail(root)

    expect(output()).not.toContain(token)
  })

  it('replaces the password with a redeemed token, and prints the new one once', async () => {
    const root = await project()
    const token = await accountWithReset(root)
    out = []

    expect(await users(root, 'reset-password', '--token', token)).toBe(0)
    const password = /Password: (\S+)/.exec(output())?.[1]
    expect(password).toBeTruthy()

    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const { createCredentialStore } = await import('@cogenta/auth')
    const userRow = await db.query<{ id: string }>(sql`select id from cogenta_users limit 1`)
    const userId = userRow.rows[0]?.id as string
    expect(await createCredentialStore(db).verifyPassword(userId, password as string)).toBe(true)
    await db.close()
  })

  it('takes a password the caller chose instead of generating one', async () => {
    const root = await project()
    const token = await accountWithReset(root)

    expect(
      await users(root, 'reset-password', '--token', token, '--password', 'a chosen passphrase'),
    ).toBe(0)

    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const { createCredentialStore } = await import('@cogenta/auth')
    const userRow = await db.query<{ id: string }>(sql`select id from cogenta_users limit 1`)
    const userId = userRow.rows[0]?.id as string
    expect(await createCredentialStore(db).verifyPassword(userId, 'a chosen passphrase')).toBe(true)
    await db.close()
  })

  it('signs out every session opened with the old password', async () => {
    const root = await project()
    const token = await accountWithReset(root)

    const before = await createSqliteHandle({ url: join(root, 'site.db') })
    const { createSessionStore } = await import('@cogenta/auth')
    const userRow = await before.query<{ id: string }>(sql`select id from cogenta_users limit 1`)
    const userId = userRow.rows[0]?.id as string
    const stolen = await createSessionStore(before).create(userId)
    expect(await createSessionStore(before).resolve(stolen.token)).not.toBeNull()
    await before.close()

    expect(await users(root, 'reset-password', '--token', token)).toBe(0)

    const after = await createSqliteHandle({ url: join(root, 'site.db') })
    // A reset that leaves whoever knew the old password signed in has reset
    // nothing.
    expect(await createSessionStore(after).resolve(stolen.token)).toBeNull()
    await after.close()
  })

  it('refuses the same token a second time', async () => {
    const root = await project()
    const token = await accountWithReset(root)

    expect(await users(root, 'reset-password', '--token', token)).toBe(0)
    err = []
    expect(await users(root, 'reset-password', '--token', token)).toBe(1)
    expect(errors()).toContain('already been used')
  })

  it('refuses a token nobody ever issued', async () => {
    const root = await project()
    await users(root, 'create', '--email', 'forgetful@example.com', '--admin')

    expect(await users(root, 'reset-password', '--token', 'made-up')).toBe(1)
    expect(errors()).toContain('does not exist')
  })

  it('invalidates the previous link when a second reset is asked for', async () => {
    const root = await project()
    const first = await accountWithReset(root)
    await users(root, 'reset-password', '--email', 'forgetful@example.com')

    // Two messages now, and only the newer token works.
    expect(await users(root, 'reset-password', '--token', first)).toBe(1)
    expect(errors()).toContain('does not exist')
  })

  it('says so when the address belongs to no account', async () => {
    const root = await project()
    expect(await users(root, 'reset-password', '--email', 'nobody@example.com')).toBe(1)
    expect(errors()).toContain('AUTH_USER_NOT_FOUND')
  })

  it('refuses --email and --token together, and refuses neither', async () => {
    const root = await project()
    expect(await users(root, 'reset-password', '--email', 'a@b.c', '--token', 'x')).toBe(2)
    expect(errors()).toContain('not both and not neither')

    err = []
    expect(await users(root, 'reset-password')).toBe(2)
    expect(errors()).toContain('not both and not neither')
  })

  it('refuses --password without a token to redeem', async () => {
    const root = await project()
    expect(await users(root, 'reset-password', '--email', 'a@b.c', '--password', 'whatever')).toBe(
      2,
    )
    expect(errors()).toContain('only means something together with --token')
  })
})
