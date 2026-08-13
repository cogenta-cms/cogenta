import { mkdtemp, writeFile } from 'node:fs/promises'
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
