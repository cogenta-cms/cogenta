import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { codeFor, createUser, startServer } from './helpers/serve-harness.js'

/**
 * Fiche 18 — profile and authentication. End to end, against a real server
 * and a real database, the three scenarios the fiche names explicitly:
 *
 *  - task 1 (the fiche's stated priority): enrol TOTP, "lose" the
 *    authenticator, sign in with a recovery code, and the same code refuses a
 *    second use.
 *  - task 2: "disconnect every other session" leaves the session making the
 *    request alive.
 *  - task 4: "my activity" cannot be redirected to read someone else's, no
 *    matter what the client asks for.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-auth-'))
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
  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

interface LoginBody {
  readonly data: {
    readonly status: 'session' | 'mfa_required'
    readonly ticket?: string
    readonly session?: { readonly token: string }
  }
}

async function passwordLogin(base: string, email: string, password: string): Promise<LoginBody> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return response.json() as Promise<LoginBody>
}

describe('cogenta serve — recovery codes (fiche 18 task 1)', () => {
  it('enrols TOTP, "loses" the authenticator, signs in with a recovery code, and the code is then dead', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'ed@example.com', 'correct horse battery staple', ['editor'])

      // No second factor yet: a password alone is enough.
      const firstLogin = await passwordLogin(
        server.base,
        'ed@example.com',
        'correct horse battery staple',
      )
      expect(firstLogin.data.status).toBe('session')
      const initialToken = firstLogin.data.session?.token
      if (initialToken === undefined) throw new Error('expected a session')
      const auth = { authorization: `Bearer ${initialToken}` }

      // Enrol TOTP through the real HTTP routes.
      const begin = await fetch(`${server.base}/api/auth/totp/enrol`, {
        method: 'POST',
        headers: auth,
      })
      expect(begin.status).toBe(200)
      const { secret } = ((await begin.json()) as { data: { secret: string } }).data

      const confirm = await fetch(`${server.base}/api/auth/totp/enrol/confirm`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ token: codeFor(secret, Date.now() / 1000) }),
      })
      expect(confirm.status).toBe(200)
      const confirmBody = (await confirm.json()) as {
        data: { enrolled: boolean; recoveryCodes: readonly string[] }
      }
      expect(confirmBody.data.enrolled).toBe(true)
      // Shown exactly once, right here.
      expect(confirmBody.data.recoveryCodes).toHaveLength(10)
      const recoveryCode = confirmBody.data.recoveryCodes[0]
      if (recoveryCode === undefined) throw new Error('no recovery code issued')

      // The next sign-in now asks for a second factor.
      const secondLogin = await passwordLogin(
        server.base,
        'ed@example.com',
        'correct horse battery staple',
      )
      expect(secondLogin.data.status).toBe('mfa_required')
      const ticket = secondLogin.data.ticket
      if (ticket === undefined) throw new Error('expected an mfa ticket')

      // "Lost the authenticator": sign in with a recovery code instead of a
      // TOTP code.
      const recoveryLogin = await fetch(`${server.base}/api/auth/recovery-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket, code: recoveryCode }),
      })
      expect(recoveryLogin.status).toBe(200)
      const recoveryBody = (await recoveryLogin.json()) as LoginBody
      expect(recoveryBody.data.status).toBe('session')
      const recoveryToken = recoveryBody.data.session?.token
      expect(recoveryToken).toBeTruthy()

      // The code is consumed: a fresh sign-in attempt with the exact same
      // code is refused, even though the ticket itself is a brand new one.
      const thirdLogin = await passwordLogin(
        server.base,
        'ed@example.com',
        'correct horse battery staple',
      )
      const secondTicket = thirdLogin.data.ticket
      if (secondTicket === undefined) throw new Error('expected an mfa ticket')
      const reuse = await fetch(`${server.base}/api/auth/recovery-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: secondTicket, code: recoveryCode }),
      })
      expect(reuse.status).toBe(401)
      const reuseBody = (await reuse.json()) as { error: { code: string } }
      expect(reuseBody.error.code).toBe('AUTH_RECOVERY_CODE_INVALID')

      // Recorded as its own event, and surfaced as a notice on the account
      // that just used the code.
      const notices = await fetch(`${server.base}/api/notices`, {
        headers: { authorization: `Bearer ${recoveryToken}` },
      })
      const noticeBody = (await notices.json()) as { data: readonly { id: string }[] }
      expect(noticeBody.data.map((notice) => notice.id)).toContain('security.recovery-code-used')
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('reports the correct remaining count and lets the account regenerate its codes', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'ed@example.com', 'correct horse battery staple', ['editor'])
      const login = await passwordLogin(
        server.base,
        'ed@example.com',
        'correct horse battery staple',
      )
      const token = login.data.session?.token
      if (token === undefined) throw new Error('expected a session')
      const auth = { authorization: `Bearer ${token}` }

      const begin = await fetch(`${server.base}/api/auth/totp/enrol`, {
        method: 'POST',
        headers: auth,
      })
      const { secret } = ((await begin.json()) as { data: { secret: string } }).data
      await fetch(`${server.base}/api/auth/totp/enrol/confirm`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ token: codeFor(secret, Date.now() / 1000) }),
      })

      const status = await fetch(`${server.base}/api/auth/totp/recovery-codes`, { headers: auth })
      expect(await status.json()).toEqual({ data: { total: 10, remaining: 10 } })

      const regenerate = await fetch(`${server.base}/api/auth/totp/recovery-codes/regenerate`, {
        method: 'POST',
        headers: auth,
      })
      expect(regenerate.status).toBe(200)
      const fresh = ((await regenerate.json()) as { data: { recoveryCodes: readonly string[] } })
        .data.recoveryCodes
      expect(fresh).toHaveLength(10)
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — sign out everywhere else (fiche 18 task 2)', () => {
  it('revokes every other session and leaves the one making the request alive', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'ed@example.com', 'correct horse battery staple', ['editor'])

      // Three "devices": three independent real logins, three real sessions.
      const currentLogin = await passwordLogin(
        server.base,
        'ed@example.com',
        'correct horse battery staple',
      )
      const laptopLogin = await passwordLogin(
        server.base,
        'ed@example.com',
        'correct horse battery staple',
      )
      const phoneLogin = await passwordLogin(
        server.base,
        'ed@example.com',
        'correct horse battery staple',
      )
      const currentToken = currentLogin.data.session?.token
      const laptopToken = laptopLogin.data.session?.token
      const phoneToken = phoneLogin.data.session?.token
      if (currentToken === undefined || laptopToken === undefined || phoneToken === undefined) {
        throw new Error('expected three real sessions')
      }

      const revoke = await fetch(`${server.base}/api/users/me/sessions/revoke-others`, {
        method: 'POST',
        headers: { authorization: `Bearer ${currentToken}` },
      })
      expect(revoke.status).toBe(200)
      const revokeBody = (await revoke.json()) as { data: { revoked: number } }
      expect(revokeBody.data.revoked).toBe(2)

      // The session that made the request is still alive.
      const still = await fetch(`${server.base}/api/auth/session`, {
        headers: { authorization: `Bearer ${currentToken}` },
      })
      expect(still.status).toBe(200)

      // Every other session is gone.
      const laptopCheck = await fetch(`${server.base}/api/auth/session`, {
        headers: { authorization: `Bearer ${laptopToken}` },
      })
      expect(laptopCheck.status).toBe(401)
      const phoneCheck = await fetch(`${server.base}/api/auth/session`, {
        headers: { authorization: `Bearer ${phoneToken}` },
      })
      expect(phoneCheck.status).toBe(401)
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — my activity (fiche 18 task 4)', () => {
  it('ignores any actor id supplied by the client and only ever shows the caller’s own activity', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'alice@example.com', 'correct horse battery staple', ['editor'])
      await createUser(root, 'bob@example.com', 'correct horse battery staple', ['editor'])

      const aliceLogin = await passwordLogin(
        server.base,
        'alice@example.com',
        'correct horse battery staple',
      )
      const bobLogin = await passwordLogin(
        server.base,
        'bob@example.com',
        'correct horse battery staple',
      )
      const aliceToken = aliceLogin.data.session?.token
      const bobToken = bobLogin.data.session?.token
      if (aliceToken === undefined || bobToken === undefined) {
        throw new Error('expected both accounts to sign in')
      }
      const aliceId = (
        (await (
          await fetch(`${server.base}/api/auth/session`, {
            headers: { authorization: `Bearer ${aliceToken}` },
          })
        ).json()) as { data: { id: string } }
      ).data.id
      const bobId = (
        (await (
          await fetch(`${server.base}/api/auth/session`, {
            headers: { authorization: `Bearer ${bobToken}` },
          })
        ).json()) as { data: { id: string } }
      ).data.id

      // Bob does something of his own, so his activity is not empty either.
      await fetch(`${server.base}/api/users/me/password`, {
        method: 'POST',
        headers: { authorization: `Bearer ${bobToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'correct horse battery staple',
          newPassword: 'a brand new long passphrase for bob',
        }),
      })

      // Non-admin, and yet reachable — this is the one audit route open to
      // anyone signed in.
      const own = await fetch(`${server.base}/api/audit/me`, {
        headers: { authorization: `Bearer ${aliceToken}` },
      })
      expect(own.status).toBe(200)
      const ownBody = (await own.json()) as { data: readonly { actorId: string | null }[] }
      expect(ownBody.data.length).toBeGreaterThan(0)
      expect(ownBody.data.every((entry) => entry.actorId === aliceId)).toBe(true)

      // The attack this route exists to refuse: ask for someone else's
      // activity by naming them in the query string.
      const spoofed = await fetch(`${server.base}/api/audit/me?actorId=${bobId}`, {
        headers: { authorization: `Bearer ${aliceToken}` },
      })
      expect(spoofed.status).toBe(200)
      const spoofedBody = (await spoofed.json()) as { data: readonly { actorId: string }[] }
      // Still Alice's own activity, never Bob's password change.
      expect(spoofedBody.data.every((entry) => entry.actorId === aliceId)).toBe(true)
      expect(spoofedBody.data.every((entry) => entry.actorId !== bobId)).toBe(true)

      // An anonymous caller gets nothing at all.
      const anonymous = await fetch(`${server.base}/api/audit/me`)
      expect(anonymous.status).toBe(401)
    } finally {
      await server.stop()
    }
  })
})
