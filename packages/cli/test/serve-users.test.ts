import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `/api/users` end to end (fiche 17): the account lifecycle over a real
 * server and a real mail directory — invitation, single-use redemption,
 * resend/cancel, bulk actions, self-service profile, dormant/MFA signals and
 * anonymization. `packages/api/test/rest/users-router.test.ts` covers the
 * same logic against the router directly with a scripted `onInvite`; this
 * file is the one that proves the mail actually gets written by
 * `@cogenta/channels`'s file transport and that the whole HTTP path — create,
 * read the mail, redeem the token, sign in — really works end to end.
 */

const COLLECTIONS: readonly CollectionDefinition[] = []

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-users-e2e-'))
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
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function adminToken(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

/** The single mail file the site's `.cogenta/mail` file transport wrote, most recent last. */
async function mailFiles(root: string): Promise<readonly string[]> {
  const directory = join(root, '.cogenta', 'mail')
  const names = await readdir(directory)
  const withStamp = await Promise.all(
    names.map(async (name) => ({ name, contents: await readFile(join(directory, name), 'utf8') })),
  )
  return withStamp.map((entry) => entry.contents)
}

/** The one-time token, read out of the invite link `sendInviteMail` wrote. */
function tokenFromMail(mail: string): string {
  const match = /[?&]token=([0-9a-f]+)/u.exec(mail)
  if (match?.[1] === undefined) throw new Error(`no token found in mail:\n${mail}`)
  return match[1]
}

async function createInvite(
  base: string,
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${base}/api/users`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ invite: true, ...body }),
  })
}

describe('cogenta serve — inviting an account by email (fiche 17 task 1)', () => {
  it('invites a colleague, who reads the mail, sets their own password, and signs in — no password ever transits in clear', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)

      const created = await createInvite(server.base, token, {
        email: 'colleague@example.com',
        roles: ['editor'],
      })
      expect(created.status).toBe(201)
      const createdBody = (await created.json()) as {
        data: { user: { status: string }; invited: boolean; emailSent: boolean; password?: string }
      }
      expect(createdBody.data.invited).toBe(true)
      expect(createdBody.data.emailSent).toBe(true)
      expect(createdBody.data.user.status).toBe('invited')
      // No password anywhere in the response: nothing to relay over a chat.
      expect(createdBody.data.password).toBeUndefined()
      expect(JSON.stringify(createdBody)).not.toMatch(/"password"\s*:\s*"/)

      const [mail] = await mailFiles(root)
      expect(mail).toBeDefined()
      expect(mail).toContain('To: colleague@example.com')
      expect(mail).toContain('editor')
      const inviteToken = tokenFromMail(mail as string)

      const accepted = await fetch(`${server.base}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          newPassword: 'a chosen passphrase for colleague',
        }),
      })
      expect(accepted.status).toBe(200)

      const signedIn = await fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'colleague@example.com',
          password: 'a chosen passphrase for colleague',
        }),
      })
      expect(signedIn.status).toBe(200)
      const loginBody = (await signedIn.json()) as { data: { status: string } }
      expect(loginBody.data.status).toBe('session')
    } finally {
      await server.stop()
    }
  })

  it('refuses the invitation token a second time, and after it expires', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createInvite(server.base, token, { email: 'once@example.com', roles: ['editor'] })
      const [mail] = await mailFiles(root)
      const inviteToken = tokenFromMail(mail as string)

      const first = await fetch(`${server.base}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, newPassword: 'a chosen passphrase, take one' }),
      })
      expect(first.status).toBe(200)

      const second = await fetch(`${server.base}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, newPassword: 'a chosen passphrase, take two' }),
      })
      expect(second.status).toBe(400)
      const secondBody = (await second.json()) as { error: { code: string } }
      expect(secondBody.error.code).toBe('AUTH_RESET_TOKEN_INVALID')
    } finally {
      await server.stop()
    }
  })

  it('falls back to a shown-once password when the caller never asks for an invitation', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/users`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'no-invite@example.com', roles: ['editor'] }),
      })
      const body = (await response.json()) as {
        data: { user: { status: string }; invited: boolean; password: string }
      }
      expect(body.data.invited).toBe(false)
      expect(body.data.user.status).toBe('active')
      expect(body.data.password.length).toBeGreaterThanOrEqual(12)
    } finally {
      await server.stop()
    }
  })

  it('resends a fresh token that invalidates the previous one', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const created = await createInvite(server.base, token, {
        email: 'resend@example.com',
        roles: ['editor'],
      })
      const { data } = (await created.json()) as { data: { user: { id: string } } }
      const [firstMail] = await mailFiles(root)
      const firstToken = tokenFromMail(firstMail as string)

      const resent = await fetch(`${server.base}/api/users/${data.user.id}/invite`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(resent.status).toBe(200)

      // File names are random UUIDs (`createFileEmailTransport`), so
      // directory order carries no chronology — the second token is
      // whichever of the two mails is not the one already read above.
      const mails = await mailFiles(root)
      expect(mails).toHaveLength(2)
      const tokens = mails.map(tokenFromMail)
      const secondToken = tokens.find((candidate) => candidate !== firstToken)
      expect(secondToken).toBeDefined()
      expect(secondToken).not.toBe(firstToken)

      const staleAttempt = await fetch(`${server.base}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: firstToken, newPassword: 'whatever, it should not matter' }),
      })
      expect(staleAttempt.status).toBe(400)

      const freshAttempt = await fetch(`${server.base}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: secondToken, newPassword: 'a real chosen passphrase' }),
      })
      expect(freshAttempt.status).toBe(200)
    } finally {
      await server.stop()
    }
  })

  it('cancels a pending invitation: the account disappears and the token dies', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const created = await createInvite(server.base, token, {
        email: 'cancelled@example.com',
        roles: ['editor'],
      })
      const { data } = (await created.json()) as { data: { user: { id: string } } }
      const [mail] = await mailFiles(root)
      const inviteToken = tokenFromMail(mail as string)

      const cancelled = await fetch(`${server.base}/api/users/${data.user.id}/invite`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(cancelled.status).toBe(204)

      const rejectedRedemption = await fetch(`${server.base}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, newPassword: 'too late now' }),
      })
      expect(rejectedRedemption.status).toBe(400)

      // The email is free again — a real re-invitation, not a stuck row.
      const recreated = await createInvite(server.base, token, {
        email: 'cancelled@example.com',
        roles: ['editor'],
      })
      expect(recreated.status).toBe(201)
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — security: only admin can list, invite or modify accounts (fiche 17)', () => {
  it("refuses a non-admin's attempt to list, invite, or read another account", async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )

      const list = await fetch(`${server.base}/api/users`, {
        headers: { authorization: `Bearer ${editorToken}` },
      })
      expect(list.status).toBe(403)

      const invite = await createInvite(server.base, editorToken, {
        email: 'nope@example.com',
        roles: ['editor'],
      })
      expect(invite.status).toBe(403)

      const bulk = await fetch(`${server.base}/api/users/bulk`, {
        method: 'POST',
        headers: { authorization: `Bearer ${editorToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'disable', ids: ['whatever'] }),
      })
      expect(bulk.status).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('refuses an anonymous caller outright', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/users`)
      expect(response.status).toBe(403)
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — bulk actions (fiche 17 task 2)', () => {
  it('disables several accounts at once and reports success and failure separately', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createUser(root, 'a@example.com', 'a real password here', ['editor'])
      await createUser(root, 'b@example.com', 'a real password here', ['editor'])

      const listed = await fetch(`${server.base}/api/users`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const { data: users } = (await listed.json()) as {
        data: readonly { id: string; email: string }[]
      }
      const ids = users.filter((u) => u.email !== 'admin@example.com').map((u) => u.id)

      const response = await fetch(`${server.base}/api/users/bulk`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'disable', ids }),
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: { succeeded: string[]; failed: unknown[] } }
      expect(body.data.succeeded.sort()).toEqual([...ids].sort())
      expect(body.data.failed).toEqual([])
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — self-service profile (fiche 17 task 3)', () => {
  it('lets an account set its own display name, avatar, bio and locale', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'ed@example.com', 'correct horse battery staple', ['editor'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'ed@example.com',
        'correct horse battery staple',
      )

      const response = await fetch(`${server.base}/api/users/me/profile`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${editorToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Ed the Editor', bio: 'Writes things.', locale: 'en' }),
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: { displayName: string; bio: string; locale: string }
      }
      expect(body.data.displayName).toBe('Ed the Editor')
      expect(body.data.bio).toBe('Writes things.')
      expect(body.data.locale).toBe('en')

      const me = await fetch(`${server.base}/api/users/me`, {
        headers: { authorization: `Bearer ${editorToken}` },
      })
      const meBody = (await me.json()) as { data: { displayName: string } }
      expect(meBody.data.displayName).toBe('Ed the Editor')
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — anonymization (fiche 17 task 5)', () => {
  it('anonymizes an account irreversibly, keeps the audit log and content attribution coherent', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createUser(root, 'leaving@example.com', 'a real password here', ['editor'])

      const listed = await fetch(`${server.base}/api/users`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const { data: users } = (await listed.json()) as {
        data: readonly { id: string; email: string }[]
      }
      const leavingId = users.find((u) => u.email === 'leaving@example.com')?.id as string

      const anonymized = await fetch(`${server.base}/api/users/${leavingId}/anonymize`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ confirmEmail: 'leaving@example.com' }),
      })
      expect(anonymized.status).toBe(200)

      // The id is stable — content attribution never breaks — but the
      // account cannot sign in with its old email and password any more.
      const oldLogin = await fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'leaving@example.com', password: 'a real password here' }),
      })
      expect(oldLogin.status).toBe(401)

      const audit = await fetch(`${server.base}/api/audit`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const { data: entries } = (await audit.json()) as {
        data: readonly { action: string; entryId: string | null }[]
      }
      const entry = entries.find((e) => e.action === 'user.anonymize' && e.entryId === leavingId)
      expect(entry).toBeDefined()
      expect(JSON.stringify(entries)).not.toContain('leaving@example.com')

      // Irreversible: even an admin cannot flip it back to active.
      const revive = await fetch(`${server.base}/api/users/${leavingId}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      expect(revive.status).toBe(409)
    } finally {
      await server.stop()
    }
  })

  it('refuses without the exact confirmation email typed', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createUser(root, 'leaving@example.com', 'a real password here', ['editor'])
      const listed = await fetch(`${server.base}/api/users`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const { data: users } = (await listed.json()) as {
        data: readonly { id: string; email: string }[]
      }
      const leavingId = users.find((u) => u.email === 'leaving@example.com')?.id as string

      const response = await fetch(`${server.base}/api/users/${leavingId}/anonymize`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ confirmEmail: 'not-the-right-address@example.com' }),
      })
      expect(response.status).toBe(400)
    } finally {
      await server.stop()
    }
  })
})
