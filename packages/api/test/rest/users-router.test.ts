import { type AuthStore, createAuthStore } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RestRequest } from '../../src/rest/http.js'
import { createUsersRouter, type InvitedUserEvent } from '../../src/rest/users-router.js'
import { type Actor, ANONYMOUS } from '../../src/types.js'

let db: DatabaseHandle
let auth: AuthStore

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  auth = await createAuthStore({
    db,
    signingKey: 'test-signing-key-not-a-real-secret',
    collections: [],
  })
})

afterEach(async () => {
  await db.close()
})

function router(
  overrides: {
    readonly onInvite?: (event: InvitedUserEvent) => Promise<void>
    readonly collections?: readonly CollectionDefinition[]
    readonly now?: () => number
  } = {},
) {
  return createUsersRouter({ auth, ...overrides })
}

function request(
  method: string,
  path: string,
  body?: unknown,
  options: { readonly token?: string } = {},
): RestRequest {
  return {
    method,
    path,
    query: {},
    ...(body === undefined ? {} : { body }),
    ...(options.token === undefined
      ? {}
      : { headers: { authorization: `Bearer ${options.token}` } }),
  }
}

function withQuery(method: string, path: string, query: Record<string, string>): RestRequest {
  return { method, path, query }
}

function actorFor(id: string, roles: readonly string[]): Actor {
  return { id, roles }
}

async function makeUser(email: string, roles: readonly string[], password?: string) {
  const user = await auth.users.create({ email, roles })
  if (password !== undefined) await auth.credentials.setPassword(user.id, password)
  return user
}

function dataOf<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data
}

function errorCodeOf(response: { body: unknown }): string {
  return (response.body as { error: { code: string } }).error.code
}

/**
 * R4: every one of these routes is a new permission surface, and the check has
 * to be on the server. A non-admin must never be able to manage another
 * account, whatever the admin UI does or does not render.
 */
describe('permissions by role', () => {
  const managementRequests: readonly (readonly [string, string, unknown?])[] = [
    ['GET', '/api/users'],
    ['POST', '/api/users', { email: 'new@example.com', roles: ['editor'] }],
  ]

  for (const [method, path, body] of managementRequests) {
    it(`refuses ${method} ${path} for an editor`, async () => {
      const editor = await makeUser('ed@example.com', ['editor'])
      const response = await router().handle(
        request(method, path, body),
        actorFor(editor.id, ['editor']),
      )
      expect(response.status).toBe(403)
      expect(errorCodeOf(response)).toBe('FORBIDDEN')
    })

    it(`refuses ${method} ${path} for an anonymous caller`, async () => {
      const response = await router().handle(request(method, path, body), ANONYMOUS)
      expect(response.status).toBe(403)
    })
  }

  it("refuses an editor changing another account's role", async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const victim = await makeUser('root@example.com', ['admin'])

    const response = await router().handle(
      request('PATCH', `/api/users/${victim.id}`, { roles: ['viewer'] }),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(403)
    expect((await auth.users.byId(victim.id))?.roles).toEqual(['admin'])
  })

  it('refuses an editor promoting themselves', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])

    const response = await router().handle(
      request('PATCH', `/api/users/${editor.id}`, { roles: ['admin'] }),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(403)
    expect((await auth.users.byId(editor.id))?.roles).toEqual(['editor'])
  })

  it("refuses an editor reading another account's profile", async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const other = await makeUser('root@example.com', ['admin'])

    const response = await router().handle(
      request('GET', `/api/users/${other.id}`),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(403)
  })

  it("refuses an editor listing another account's sessions", async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const other = await makeUser('root@example.com', ['admin'])

    const response = await router().handle(
      request('GET', `/api/users/${other.id}/sessions`),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(403)
  })

  it("refuses an editor revoking another account's session", async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const other = await makeUser('root@example.com', ['admin'])
    const session = await auth.sessions.create(other.id)

    const response = await router().handle(
      request('DELETE', `/api/users/${other.id}/sessions/${session.id}`),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(403)
    expect(await auth.sessions.resolve(session.token)).not.toBeNull()
  })

  it('lets an editor read their own profile and sessions', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const asSelf = actorFor(editor.id, ['editor'])

    expect((await router().handle(request('GET', '/api/users/me'), asSelf)).status).toBe(200)
    expect((await router().handle(request('GET', '/api/users/me/sessions'), asSelf)).status).toBe(
      200,
    )
  })

  it('refuses "me" to an anonymous caller rather than guessing an account', async () => {
    const response = await router().handle(request('GET', '/api/users/me'), ANONYMOUS)
    expect(response.status).toBe(401)
    expect(errorCodeOf(response)).toBe('UNAUTHENTICATED')
  })
})

describe('GET /api/users', () => {
  it('lists every account, with whether each has a second factor', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const editor = await makeUser('ed@example.com', ['editor'])
    await auth.credentials.setTotpSecret(editor.id, 'JBSWY3DPEHPK3PXP')
    await auth.credentials.confirmTotp(editor.id)

    const response = await router().handle(
      request('GET', '/api/users'),
      actorFor(admin.id, ['admin']),
    )
    const users = dataOf<{ id: string; mfa: { totp: boolean; passkeys: number } }[]>(response)
    expect(users).toHaveLength(2)
    expect(users.find((user) => user.id === editor.id)?.mfa.totp).toBe(true)
    expect(users.find((user) => user.id === admin.id)?.mfa.totp).toBe(false)
  })

  it('filters by role', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    await makeUser('ed@example.com', ['editor'])
    await makeUser('rev@example.com', ['editor', 'reviewer'])

    const response = await router().handle(
      withQuery('GET', '/api/users', { role: 'editor' }),
      actorFor(admin.id, ['admin']),
    )
    const users = dataOf<{ email: string }[]>(response)
    expect(users.map((user) => user.email).sort()).toEqual(['ed@example.com', 'rev@example.com'])
  })

  it('never returns anything that could sign someone in', async () => {
    const admin = await makeUser('root@example.com', ['admin'], 'correct horse battery staple')
    const response = await router().handle(
      request('GET', '/api/users'),
      actorFor(admin.id, ['admin']),
    )
    expect(JSON.stringify(response.body)).not.toContain('scrypt$')
  })

  it('filters by a substring of the email with `q`, case-insensitively', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    await makeUser('cathy@example.com', ['editor'])
    await makeUser('harbor-team@example.com', ['editor'])

    const response = await router().handle(
      withQuery('GET', '/api/users', { q: 'CATHY' }),
      actorFor(admin.id, ['admin']),
    )
    const users = dataOf<{ email: string }[]>(response)
    expect(users.map((user) => user.email)).toEqual(['cathy@example.com'])
  })

  it('refuses a non-admin `q` search the same way it refuses every other list', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const response = await router().handle(
      withQuery('GET', '/api/users', { q: 'anything' }),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(403)
  })
})

describe('POST /api/users', () => {
  it('creates the account and returns a generated password exactly once', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const response = await router().handle(
      request('POST', '/api/users', { email: 'New@Example.com', roles: ['editor'] }),
      actorFor(admin.id, ['admin']),
    )

    expect(response.status).toBe(201)
    const { user, password } = dataOf<{
      user: { id: string; email: string; roles: string[] }
      password: string
    }>(response)
    expect(user.email).toBe('new@example.com')
    expect(user.roles).toEqual(['editor'])
    expect(password.length).toBeGreaterThanOrEqual(12)

    // The password is real: it signs the new account in.
    const login = await auth.login.passwordLogin('new@example.com', password)
    expect(login.status).toBe('session')

    // And it is not stored anywhere it could be read back.
    const reread = await router().handle(
      request('GET', `/api/users/${user.id}`),
      actorFor(admin.id, ['admin']),
    )
    expect(JSON.stringify(reread.body)).not.toContain(password)
  })

  it('refuses an account with no role at all', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const response = await router().handle(
      request('POST', '/api/users', { email: 'new@example.com', roles: [] }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(400)
  })

  it('refuses a duplicate email', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    await makeUser('taken@example.com', ['editor'])

    const response = await router().handle(
      request('POST', '/api/users', { email: 'taken@example.com', roles: ['editor'] }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(409)
    expect(errorCodeOf(response)).toBe('AUTH_USER_EXISTS')
  })
})

describe('PATCH /api/users/{id}', () => {
  it('changes a role', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const editor = await makeUser('ed@example.com', ['editor'])

    const response = await router().handle(
      request('PATCH', `/api/users/${editor.id}`, { roles: ['reviewer'] }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(200)
    expect((await auth.users.byId(editor.id))?.roles).toEqual(['reviewer'])
  })

  it('disables an account and ends its live sessions in the same move', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const editor = await makeUser('ed@example.com', ['editor'])
    const session = await auth.sessions.create(editor.id)

    const response = await router().handle(
      request('PATCH', `/api/users/${editor.id}`, { status: 'disabled' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(200)
    expect((await auth.users.byId(editor.id))?.status).toBe('disabled')
    expect(await auth.sessions.resolve(session.token)).toBeNull()
  })

  it('refuses a change with nothing in it', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const editor = await makeUser('ed@example.com', ['editor'])

    const response = await router().handle(
      request('PATCH', `/api/users/${editor.id}`, {}),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(400)
  })

  it('refuses an unknown status rather than storing it', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const editor = await makeUser('ed@example.com', ['editor'])

    const response = await router().handle(
      request('PATCH', `/api/users/${editor.id}`, { status: 'deleted' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(400)
    expect((await auth.users.byId(editor.id))?.status).toBe('active')
  })

  it('404s on an account that does not exist', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const response = await router().handle(
      request('PATCH', '/api/users/nope', { roles: ['editor'] }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(404)
  })
})

/**
 * A locked door with the key on the inside is not a permission problem: the
 * person doing it is allowed to. With no password reset (L13) and no other way
 * in, this is the only thing between one click and an unadministrable site.
 */
describe('the last admin', () => {
  it('cannot be demoted', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const response = await router().handle(
      request('PATCH', `/api/users/${admin.id}`, { roles: ['editor'] }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(403)
    expect((await auth.users.byId(admin.id))?.roles).toEqual(['admin'])
  })

  it('cannot be disabled', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const response = await router().handle(
      request('PATCH', `/api/users/${admin.id}`, { status: 'disabled' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(403)
    expect((await auth.users.byId(admin.id))?.status).toBe('active')
  })

  it('can be demoted once a second admin exists', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const second = await makeUser('second@example.com', ['admin'])

    const response = await router().handle(
      request('PATCH', `/api/users/${admin.id}`, { roles: ['editor'] }),
      actorFor(second.id, ['admin']),
    )
    expect(response.status).toBe(200)
    expect((await auth.users.byId(admin.id))?.roles).toEqual(['editor'])
  })

  it('does not count a disabled admin as a way back in', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const shelved = await makeUser('old@example.com', ['admin'])
    await auth.users.setStatus(shelved.id, 'disabled')

    const response = await router().handle(
      request('PATCH', `/api/users/${admin.id}`, { status: 'disabled' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(403)
  })
})

describe('POST /api/users/me/password', () => {
  it('changes the password when the current one is right', async () => {
    const editor = await makeUser('ed@example.com', ['editor'], 'correct horse battery staple')
    const response = await router().handle(
      request('POST', '/api/users/me/password', {
        currentPassword: 'correct horse battery staple',
        newPassword: 'a much longer new passphrase',
      }),
      actorFor(editor.id, ['editor']),
    )

    expect(response.status).toBe(200)
    expect(await auth.credentials.verifyPassword(editor.id, 'a much longer new passphrase')).toBe(
      true,
    )
    expect(await auth.credentials.verifyPassword(editor.id, 'correct horse battery staple')).toBe(
      false,
    )
  })

  it('refuses without the current password, and leaves the old one working', async () => {
    const editor = await makeUser('ed@example.com', ['editor'], 'correct horse battery staple')
    const response = await router().handle(
      request('POST', '/api/users/me/password', {
        currentPassword: 'not it',
        newPassword: 'a much longer new passphrase',
      }),
      actorFor(editor.id, ['editor']),
    )

    expect(response.status).toBe(401)
    expect(await auth.credentials.verifyPassword(editor.id, 'correct horse battery staple')).toBe(
      true,
    )
  })

  it('refuses a new password below the minimum length', async () => {
    const editor = await makeUser('ed@example.com', ['editor'], 'correct horse battery staple')
    const response = await router().handle(
      request('POST', '/api/users/me/password', {
        currentPassword: 'correct horse battery staple',
        newPassword: 'short',
      }),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(400)
    expect(errorCodeOf(response)).toBe('AUTH_PASSWORD_INVALID')
  })

  it('rate-limits repeated wrong current passwords', async () => {
    const editor = await makeUser('ed@example.com', ['editor'], 'correct horse battery staple')
    const actor = actorFor(editor.id, ['editor'])
    const wrong = request('POST', '/api/users/me/password', {
      currentPassword: 'not it',
      newPassword: 'a much longer new passphrase',
    })

    for (let i = 0; i < 5; i += 1) await router().handle(wrong, actor)
    const response = await router().handle(wrong, actor)
    expect(response.status).toBe(429)
  })

  it("refuses an admin setting somebody else's password: that is a reset, not a change", async () => {
    const admin = await makeUser('root@example.com', ['admin'], 'correct horse battery staple')
    const editor = await makeUser('ed@example.com', ['editor'], 'the editors own password')

    const response = await router().handle(
      request('POST', `/api/users/${editor.id}/password`, {
        currentPassword: 'correct horse battery staple',
        newPassword: 'a much longer new passphrase',
      }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(403)
    expect(await auth.credentials.verifyPassword(editor.id, 'the editors own password')).toBe(true)
  })
})

describe('sessions', () => {
  it('lists your own active sessions without the token that would replay them', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const session = await auth.sessions.create(editor.id, { label: 'Work laptop' })

    const response = await router().handle(
      request('GET', '/api/users/me/sessions'),
      actorFor(editor.id, ['editor']),
    )
    const sessions = dataOf<{ id: string; label: string | null }[]>(response)
    expect(sessions.map((entry) => entry.id)).toEqual([session.id])
    expect(sessions[0]?.label).toBe('Work laptop')
    expect(JSON.stringify(response.body)).not.toContain(session.token)
  })

  it('revokes one of your own sessions and leaves the others alone', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const doomed = await auth.sessions.create(editor.id)
    const kept = await auth.sessions.create(editor.id)

    const response = await router().handle(
      request('DELETE', `/api/users/me/sessions/${doomed.id}`),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(204)
    expect(await auth.sessions.resolve(doomed.token)).toBeNull()
    expect(await auth.sessions.resolve(kept.token)).not.toBeNull()
  })

  it("refuses to revoke a session id that is not this account's, even under /me", async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const other = await makeUser('other@example.com', ['editor'])
    const theirs = await auth.sessions.create(other.id)

    const response = await router().handle(
      request('DELETE', `/api/users/me/sessions/${theirs.id}`),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(404)
    expect(await auth.sessions.resolve(theirs.token)).not.toBeNull()
  })

  it("lets an admin see and revoke another account's session", async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const editor = await makeUser('ed@example.com', ['editor'])
    const session = await auth.sessions.create(editor.id)

    const listed = await router().handle(
      request('GET', `/api/users/${editor.id}/sessions`),
      actorFor(admin.id, ['admin']),
    )
    expect(dataOf<{ id: string }[]>(listed).map((entry) => entry.id)).toEqual([session.id])

    const revoked = await router().handle(
      request('DELETE', `/api/users/${editor.id}/sessions/${session.id}`),
      actorFor(admin.id, ['admin']),
    )
    expect(revoked.status).toBe(204)
    expect(await auth.sessions.resolve(session.token)).toBeNull()
  })

  // Fiche 18 task 2: readable sessions and a real "current session" marker.
  it('reports browser, device and which session is the one making the request', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const thisOne = await auth.sessions.create(editor.id, {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    })
    const another = await auth.sessions.create(editor.id, {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    })

    const response = await router().handle(
      request('GET', '/api/users/me/sessions', undefined, { token: thisOne.token }),
      actorFor(editor.id, ['editor']),
    )
    const sessions =
      dataOf<{ id: string; browser: string; device: string; isCurrent: boolean }[]>(response)

    const mine = sessions.find((entry) => entry.id === thisOne.id)
    const other = sessions.find((entry) => entry.id === another.id)
    expect(mine).toMatchObject({ browser: 'chrome', device: 'desktop', isCurrent: true })
    expect(other).toMatchObject({ browser: 'safari', device: 'mobile', isCurrent: false })
  })

  it('never marks a session as current for an admin looking at someone else’s list', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const adminSession = await auth.sessions.create(admin.id)
    const editor = await makeUser('ed@example.com', ['editor'])
    await auth.sessions.create(editor.id)

    const response = await router().handle(
      request('GET', `/api/users/${editor.id}/sessions`, undefined, {
        token: adminSession.token,
      }),
      actorFor(admin.id, ['admin']),
    )
    const sessions = dataOf<{ isCurrent: boolean }[]>(response)
    expect(sessions.every((entry) => entry.isCurrent === false)).toBe(true)
  })

  describe('POST /api/users/me/sessions/revoke-others', () => {
    it('signs out every other session and keeps the one making the request alive', async () => {
      const editor = await makeUser('ed@example.com', ['editor'])
      const current = await auth.sessions.create(editor.id, { label: 'this device' })
      const laptop = await auth.sessions.create(editor.id, { label: 'laptop' })
      const phone = await auth.sessions.create(editor.id, { label: 'phone' })

      const response = await router().handle(
        request('POST', '/api/users/me/sessions/revoke-others', undefined, {
          token: current.token,
        }),
        actorFor(editor.id, ['editor']),
      )
      expect(response.status).toBe(200)
      expect(dataOf<{ revoked: number; keptSessionId: string }>(response)).toEqual({
        revoked: 2,
        keptSessionId: current.id,
      })

      expect(await auth.sessions.resolve(current.token)).not.toBeNull()
      expect(await auth.sessions.resolve(laptop.token)).toBeNull()
      expect(await auth.sessions.resolve(phone.token)).toBeNull()
    })

    it('refuses without a valid current session, even for the account owner', async () => {
      const editor = await makeUser('ed@example.com', ['editor'])
      await auth.sessions.create(editor.id)

      const response = await router().handle(
        request('POST', '/api/users/me/sessions/revoke-others'),
        actorFor(editor.id, ['editor']),
      )
      expect(response.status).toBe(401)
    })

    it('refuses an admin trying to end another account’s "other" sessions', async () => {
      const admin = await makeUser('root@example.com', ['admin'])
      const adminSession = await auth.sessions.create(admin.id)
      const editor = await makeUser('ed@example.com', ['editor'])
      const editorSession = await auth.sessions.create(editor.id)

      const response = await router().handle(
        request('POST', `/api/users/${editor.id}/sessions/revoke-others`, undefined, {
          token: adminSession.token,
        }),
        actorFor(admin.id, ['admin']),
      )
      expect(response.status).toBe(403)
      expect(await auth.sessions.resolve(editorSession.token)).not.toBeNull()
    })

    it('refuses GET', async () => {
      const editor = await makeUser('ed@example.com', ['editor'])
      const session = await auth.sessions.create(editor.id)
      const response = await router().handle(
        request('GET', '/api/users/me/sessions/revoke-others', undefined, {
          token: session.token,
        }),
        actorFor(editor.id, ['editor']),
      )
      expect(response.status).toBe(405)
    })
  })
})

/**
 * Invitations (fiche 17 task 1) — the R1 fallback is not a side branch, it is
 * the *default*: `POST /api/users` behaves exactly as it always has unless a
 * caller both asks for `invite: true` and the router was wired with
 * `onInvite`. Every test above this point already proves the unmodified
 * path is untouched; these prove the two new ones.
 */
describe('invitations', () => {
  it('creates an account without a password when invited and an email transport exists', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const onInvite = vi.fn(async (_event: InvitedUserEvent): Promise<void> => undefined)

    const response = await router({ onInvite }).handle(
      request('POST', '/api/users', {
        email: 'colleague@example.com',
        roles: ['editor'],
        invite: true,
      }),
      actorFor(admin.id, ['admin']),
    )

    expect(response.status).toBe(201)
    const body = dataOf<{
      user: { id: string; email: string; status: string }
      invited: boolean
      emailSent: boolean
      password?: string
    }>(response)
    expect(body.invited).toBe(true)
    expect(body.emailSent).toBe(true)
    expect(body.user.status).toBe('invited')
    expect(body.password).toBeUndefined()
    expect(JSON.stringify(response.body)).not.toContain('scrypt$')

    expect(onInvite).toHaveBeenCalledOnce()
    const event = onInvite.mock.calls[0]?.[0] as InvitedUserEvent
    expect(event.user.email).toBe('colleague@example.com')
    expect(event.roles).toEqual(['editor'])
    expect(event.token).toBeTruthy()

    // Cannot sign in without a password yet — invited is not active.
    await expect(
      auth.login.passwordLogin('colleague@example.com', 'anything'),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    })
  })

  it('falls back to a generated password when no email transport is configured (R1)', async () => {
    const admin = await makeUser('root@example.com', ['admin'])

    const response = await router().handle(
      request('POST', '/api/users', {
        email: 'colleague@example.com',
        roles: ['editor'],
        invite: true,
      }),
      actorFor(admin.id, ['admin']),
    )

    expect(response.status).toBe(201)
    const body = dataOf<{
      user: { status: string }
      invited: boolean
      emailSent: boolean
      password: string
    }>(response)
    expect(body.invited).toBe(false)
    expect(body.emailSent).toBe(false)
    expect(body.user.status).toBe('active')
    expect(body.password.length).toBeGreaterThanOrEqual(12)

    const login = await auth.login.passwordLogin('colleague@example.com', body.password)
    expect(login.status).toBe('session')
  })

  it('reports whether invitation email is available on the collection route', async () => {
    const admin = await makeUser('root@example.com', ['admin'])

    const without = await router().handle(
      request('GET', '/api/users'),
      actorFor(admin.id, ['admin']),
    )
    expect(
      (without.body as { meta: { invitationEmailAvailable: boolean } }).meta
        .invitationEmailAvailable,
    ).toBe(false)

    const withInvite = await router({ onInvite: async () => undefined }).handle(
      request('GET', '/api/users'),
      actorFor(admin.id, ['admin']),
    )
    expect(
      (withInvite.body as { meta: { invitationEmailAvailable: boolean } }).meta
        .invitationEmailAvailable,
    ).toBe(true)
  })

  it('lets the invitee redeem the token and become active, end to end', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    let captured: InvitedUserEvent | undefined
    const onInvite = async (event: InvitedUserEvent): Promise<void> => {
      captured = event
    }

    await router({ onInvite }).handle(
      request('POST', '/api/users', {
        email: 'invitee@example.com',
        roles: ['editor'],
        invite: true,
      }),
      actorFor(admin.id, ['admin']),
    )
    expect(captured).toBeDefined()

    // The invitee redeems it the same way a forgot-password link is redeemed:
    // `resets.redeem` plus setting a password — auth-router.ts's job, proven
    // directly against the primitive here since this suite has no HTTP auth
    // router. The real end-to-end version runs through cogenta serve
    // (packages/cli/test/serve-users.test.ts).
    const outcome = await auth.resets.redeem((captured as InvitedUserEvent).token)
    expect(outcome.kind).toBe('ready')
    if (outcome.kind !== 'ready') throw new Error('unreachable')
    await auth.credentials.setPassword(outcome.userId, 'a chosen passphrase for the invitee')

    const invitee = await auth.users.byId(outcome.userId)
    expect(invitee?.status).toBe('invited') // activation is auth-router.ts's job, not resets.redeem's

    // Second redemption of the same token must fail (single use).
    expect((await auth.resets.redeem((captured as InvitedUserEvent).token)).kind).toBe('used')
  })

  describe('resend and cancel', () => {
    async function invitedUser(
      onInvite: (event: InvitedUserEvent) => Promise<void> = async () => undefined,
    ) {
      const admin = await makeUser('root@example.com', ['admin'])
      const created = await router({ onInvite }).handle(
        request('POST', '/api/users', {
          email: 'invitee@example.com',
          roles: ['editor'],
          invite: true,
        }),
        actorFor(admin.id, ['admin']),
      )
      const { user } = dataOf<{ user: { id: string } }>(created)
      return { admin, userId: user.id }
    }

    it('resends a fresh token, invalidating the old one', async () => {
      let firstToken: string | undefined
      const admin = await makeUser('root@example.com', ['admin'])
      const onInviteFirst = async (event: InvitedUserEvent): Promise<void> => {
        firstToken = event.token
      }
      const created = await router({ onInvite: onInviteFirst }).handle(
        request('POST', '/api/users', {
          email: 'invitee@example.com',
          roles: ['editor'],
          invite: true,
        }),
        actorFor(admin.id, ['admin']),
      )
      const { user } = dataOf<{ user: { id: string } }>(created)

      let secondToken: string | undefined
      const onInviteSecond = async (event: InvitedUserEvent): Promise<void> => {
        secondToken = event.token
      }
      const resent = await router({ onInvite: onInviteSecond }).handle(
        request('POST', `/api/users/${user.id}/invite`),
        actorFor(admin.id, ['admin']),
      )
      expect(resent.status).toBe(200)
      expect(secondToken).toBeTruthy()
      expect(secondToken).not.toBe(firstToken)

      expect((await auth.resets.redeem(firstToken as string)).kind).toBe('invalid')
      expect((await auth.resets.redeem(secondToken as string)).kind).toBe('ready')
    })

    it('refuses to resend for an account that already accepted', async () => {
      const { admin, userId } = await invitedUser()
      await auth.users.setStatus(userId, 'active')

      const response = await router({ onInvite: async () => undefined }).handle(
        request('POST', `/api/users/${userId}/invite`),
        actorFor(admin.id, ['admin']),
      )
      expect(response.status).toBe(409)
      expect(errorCodeOf(response)).toBe('AUTH_INVITE_INVALID_STATE')
    })

    it('refuses to resend when no email transport is configured', async () => {
      const { admin, userId } = await invitedUser()

      const response = await router().handle(
        request('POST', `/api/users/${userId}/invite`),
        actorFor(admin.id, ['admin']),
      )
      expect(response.status).toBe(503)
      expect(errorCodeOf(response)).toBe('AUTH_INVITE_UNAVAILABLE')
    })

    it('cancels a pending invitation: the token dies and the account disappears', async () => {
      let token: string | undefined
      const { admin, userId } = await invitedUser(async (event) => {
        token = event.token
      })

      const cancelled = await router().handle(
        request('DELETE', `/api/users/${userId}/invite`),
        actorFor(admin.id, ['admin']),
      )
      expect(cancelled.status).toBe(204)
      expect(await auth.users.byId(userId)).toBeNull()
      expect((await auth.resets.redeem(token as string)).kind).toBe('invalid')
    })

    it('frees the email address for a fresh invitation after cancelling', async () => {
      const { admin, userId } = await invitedUser()
      await router().handle(
        request('DELETE', `/api/users/${userId}/invite`),
        actorFor(admin.id, ['admin']),
      )

      const recreated = await router().handle(
        request('POST', '/api/users', { email: 'invitee@example.com', roles: ['editor'] }),
        actorFor(admin.id, ['admin']),
      )
      expect(recreated.status).toBe(201)
    })

    it('refuses a non-admin invite/resend/cancel', async () => {
      const { userId } = await invitedUser()
      const editor = await makeUser('ed@example.com', ['editor'])

      const resend = await router({ onInvite: async () => undefined }).handle(
        request('POST', `/api/users/${userId}/invite`),
        actorFor(editor.id, ['editor']),
      )
      expect(resend.status).toBe(403)

      const cancel = await router().handle(
        request('DELETE', `/api/users/${userId}/invite`),
        actorFor(editor.id, ['editor']),
      )
      expect(cancel.status).toBe(403)
    })
  })

  it('invalidates the outstanding invitation token when the role changes before acceptance', async () => {
    let token: string | undefined
    const admin = await makeUser('root@example.com', ['admin'])
    const created = await router({
      onInvite: async (event) => {
        token = event.token
      },
    }).handle(
      request('POST', '/api/users', {
        email: 'invitee@example.com',
        roles: ['editor'],
        invite: true,
      }),
      actorFor(admin.id, ['admin']),
    )
    const { user } = dataOf<{ user: { id: string } }>(created)

    const patched = await router().handle(
      request('PATCH', `/api/users/${user.id}`, { roles: ['admin'] }),
      actorFor(admin.id, ['admin']),
    )
    expect(patched.status).toBe(200)

    expect((await auth.resets.redeem(token as string)).kind).toBe('invalid')
  })
})

describe('GET /api/users pagination and sorting (fiche 17 task 2)', () => {
  it('paginates by cursor, never repeating or skipping an account', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    for (let i = 0; i < 5; i++) await makeUser(`user${i}@example.com`, ['editor'])

    const seen: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < 10; page++) {
      const response = await router().handle(
        withQuery(
          'GET',
          '/api/users',
          cursor === undefined ? { limit: '2' } : { limit: '2', after: cursor },
        ),
        actorFor(admin.id, ['admin']),
      )
      const users = dataOf<{ id: string }[]>(response)
      seen.push(...users.map((u) => u.id))
      const pageInfo = (response.body as { page: { hasMore: boolean; nextCursor: string | null } })
        .page
      if (!pageInfo.hasMore) break
      cursor = pageInfo.nextCursor as string
    }

    expect(new Set(seen).size).toBe(seen.length) // no duplicates
    expect(seen.length).toBe(6) // 5 created + the admin itself
  })

  it('sorts by lastSignInAt, accounts that never signed in ordered consistently', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const never = await makeUser('never@example.com', ['editor'])
    const session = await auth.sessions.create(never.id)
    await auth.sessions.resolve(session.token) // stamps lastSeenAt

    const response = await router().handle(
      withQuery('GET', '/api/users', { sort: 'lastSignInAt:desc' }),
      actorFor(admin.id, ['admin']),
    )
    const users = dataOf<{ id: string; lastSignInAt: string | null }[]>(response)
    expect(users.find((u) => u.id === never.id)?.lastSignInAt).toBeTruthy()
    expect(users.find((u) => u.id === admin.id)?.lastSignInAt).toBeNull()
  })

  it('refuses an unknown sort field', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const response = await router().handle(
      withQuery('GET', '/api/users', { sort: 'email:asc' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(400)
  })

  it('refuses a limit above the maximum', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const response = await router().handle(
      withQuery('GET', '/api/users', { limit: '1000' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(400)
  })

  it('matches a display name, not just an email, with `q`', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const editor = await makeUser('anonymous-handle@example.com', ['editor'])
    await router().handle(
      request('PATCH', `/api/users/me/profile`, { displayName: 'Grace Hopper' }),
      actorFor(editor.id, ['editor']),
    )

    const response = await router().handle(
      withQuery('GET', '/api/users', { q: 'grace' }),
      actorFor(admin.id, ['admin']),
    )
    expect(dataOf<{ id: string }[]>(response).map((u) => u.id)).toEqual([editor.id])
  })
})

describe('POST /api/users/bulk (fiche 17 task 2)', () => {
  it('disables several accounts at once', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const a = await makeUser('a@example.com', ['editor'])
    const b = await makeUser('b@example.com', ['editor'])

    const response = await router().handle(
      request('POST', '/api/users/bulk', { action: 'disable', ids: [a.id, b.id] }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(200)
    const body = dataOf<{ succeeded: string[]; failed: unknown[] }>(response)
    expect(body.succeeded.sort()).toEqual([a.id, b.id].sort())
    expect(body.failed).toEqual([])
    expect((await auth.users.byId(a.id))?.status).toBe('disabled')
    expect((await auth.users.byId(b.id))?.status).toBe('disabled')
  })

  it('changes roles in bulk', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const a = await makeUser('a@example.com', ['editor'])
    const b = await makeUser('b@example.com', ['editor'])

    const response = await router().handle(
      request('POST', '/api/users/bulk', {
        action: 'setRoles',
        ids: [a.id, b.id],
        roles: ['reviewer'],
      }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(200)
    expect((await auth.users.byId(a.id))?.roles).toEqual(['reviewer'])
    expect((await auth.users.byId(b.id))?.roles).toEqual(['reviewer'])
  })

  it('names the accounts that failed without undoing the ones that succeeded', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const a = await makeUser('a@example.com', ['editor'])
    const secondAdmin = await makeUser('second-admin@example.com', ['admin'])
    // Demote the second admin first so admin+secondAdmin become "one active admin",
    // making a further disable of secondAdmin the one that would lock everyone out.
    await auth.users.setRoles(admin.id, ['editor'])

    const response = await router().handle(
      request('POST', '/api/users/bulk', { action: 'disable', ids: [a.id, secondAdmin.id] }),
      actorFor(secondAdmin.id, ['admin']),
    )
    const body = dataOf<{ succeeded: string[]; failed: { id: string; error: string }[] }>(response)
    expect(body.succeeded).toEqual([a.id])
    expect(body.failed).toHaveLength(1)
    expect(body.failed[0]?.id).toBe(secondAdmin.id)
    expect((await auth.users.byId(a.id))?.status).toBe('disabled')
    expect((await auth.users.byId(secondAdmin.id))?.status).toBe('active')
  })

  it('refuses a non-admin', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const victim = await makeUser('victim@example.com', ['editor'])

    const response = await router().handle(
      request('POST', '/api/users/bulk', { action: 'disable', ids: [victim.id] }),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(403)
    expect((await auth.users.byId(victim.id))?.status).toBe('active')
  })

  it('refuses an empty id list', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const response = await router().handle(
      request('POST', '/api/users/bulk', { action: 'disable', ids: [] }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(400)
  })
})

describe('PATCH /api/users/me/profile (fiche 17 task 3)', () => {
  it('sets the display name, avatar, bio and locale on your own account', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const response = await router().handle(
      request('PATCH', '/api/users/me/profile', {
        displayName: 'Ed',
        avatarMediaId: 'media-1',
        bio: 'Writes things.',
        locale: 'fr-CA',
      }),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(200)
    const user = dataOf<{
      displayName: string
      avatarMediaId: string
      bio: string
      locale: string
    }>(response)
    expect(user.displayName).toBe('Ed')
    expect(user.avatarMediaId).toBe('media-1')
    expect(user.bio).toBe('Writes things.')
    expect(user.locale).toBe('fr-CA')
  })

  it('refuses to change somebody else’s profile, even for an admin', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const victim = await makeUser('victim@example.com', ['editor'])

    const response = await router().handle(
      request('PATCH', `/api/users/${victim.id}/profile`, { displayName: 'Not you' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(403)
    expect((await auth.users.byId(victim.id))?.displayName).toBeNull()
  })

  it('refuses an anonymous caller', async () => {
    const response = await router().handle(
      request('PATCH', '/api/users/me/profile', { displayName: 'Nobody' }),
      ANONYMOUS,
    )
    expect(response.status).toBe(401)
  })

  it('rejects a locale that is not a language tag', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const response = await router().handle(
      request('PATCH', '/api/users/me/profile', { locale: 'not a locale!' }),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(400)
  })

  it('rejects a display name over the length limit', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const response = await router().handle(
      request('PATCH', '/api/users/me/profile', { displayName: 'x'.repeat(200) }),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(400)
  })
})

describe('dormant accounts and the MFA-recommended signal (fiche 17 task 4)', () => {
  const collections: readonly CollectionDefinition[] = [
    {
      name: 'post',
      labels: { singular: 'Post', plural: 'Posts' },
      fields: {},
      permissions: {
        read: ['viewer'],
        create: ['editor'],
        update: ['editor'],
        publish: ['editor'],
      },
    },
  ]

  it('flags an account whose sensitive role has no second factor', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const response = await router({ collections }).handle(
      request('GET', `/api/users/${admin.id}`),
      actorFor(admin.id, ['admin']),
    )
    expect(dataOf<{ mfaRecommended: boolean }>(response).mfaRecommended).toBe(true)
  })

  it('never flags an account once a second factor is enrolled', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    await auth.credentials.setTotpSecret(admin.id, 'JBSWY3DPEHPK3PXP')
    await auth.credentials.confirmTotp(admin.id)

    const response = await router({ collections }).handle(
      request('GET', `/api/users/${admin.id}`),
      actorFor(admin.id, ['admin']),
    )
    expect(dataOf<{ mfaRecommended: boolean }>(response).mfaRecommended).toBe(false)
  })

  it('never flags a non-sensitive role', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const viewer = await makeUser('viewer@example.com', ['viewer'])
    const response = await router({ collections }).handle(
      request('GET', `/api/users/${viewer.id}`),
      actorFor(admin.id, ['admin']),
    )
    expect(dataOf<{ mfaRecommended: boolean }>(response).mfaRecommended).toBe(false)
  })

  it('marks an account with no sign-in ever as dormant', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const dormant = await makeUser('dormant@example.com', ['editor'])

    const response = await router().handle(
      request('GET', `/api/users/${dormant.id}`),
      actorFor(admin.id, ['admin']),
    )
    expect(dataOf<{ dormant: boolean }>(response).dormant).toBe(true)
  })

  it('does not mark a recently active account as dormant', async () => {
    // A second `AuthStore` over the same tables, with its own controllable
    // clock — `sessions.create` stamps `lastSeenAt` from *this* clock, and
    // the router below reads the exact same variable, so the two can never
    // drift apart the way two independent `Date.now()` calls could.
    const clock = Date.parse('2026-08-19T00:00:00.000Z')
    const clocked = await createAuthStore({
      db,
      signingKey: 'test-signing-key-not-a-real-secret',
      collections: [],
      now: () => clock,
    })
    const admin = await makeUser('root@example.com', ['admin'])
    const active = await makeUser('active@example.com', ['editor'])
    await clocked.sessions.create(active.id)

    const response = await createUsersRouter({ auth, now: () => clock }).handle(
      request('GET', `/api/users/${active.id}`),
      actorFor(admin.id, ['admin']),
    )
    expect(dataOf<{ dormant: boolean }>(response).dormant).toBe(false)
  })

  it('marks an account dormant past the threshold since its last sign-in', async () => {
    let clock = Date.parse('2026-08-19T00:00:00.000Z')
    const clocked = await createAuthStore({
      db,
      signingKey: 'test-signing-key-not-a-real-secret',
      collections: [],
      now: () => clock,
    })
    const admin = await makeUser('root@example.com', ['admin'])
    const stale = await makeUser('stale@example.com', ['editor'])
    await clocked.sessions.create(stale.id)

    clock += 91 * 24 * 60 * 60 * 1000

    const response = await createUsersRouter({ auth, now: () => clock }).handle(
      request('GET', `/api/users/${stale.id}`),
      actorFor(admin.id, ['admin']),
    )
    expect(dataOf<{ dormant: boolean }>(response).dormant).toBe(true)
  })

  it('never marks an invited or anonymized account as dormant', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const invited = await auth.users.create({
      email: 'invited@example.com',
      roles: ['editor'],
      status: 'invited',
    })

    const response = await router().handle(
      request('GET', `/api/users/${invited.id}`),
      actorFor(admin.id, ['admin']),
    )
    expect(dataOf<{ dormant: boolean }>(response).dormant).toBe(false)
  })
})

describe('POST /api/users/{id}/anonymize (fiche 17 task 5)', () => {
  it('replaces the email, revokes sessions, and blocks sign-in', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const leaving = await makeUser('leaving@example.com', ['editor'], 'a real password here')
    const session = await auth.sessions.create(leaving.id)

    const response = await router().handle(
      request('POST', `/api/users/${leaving.id}/anonymize`, {
        confirmEmail: 'leaving@example.com',
      }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(200)

    const anonymized = await auth.users.byId(leaving.id)
    expect(anonymized?.status).toBe('anonymized')
    expect(anonymized?.email).not.toBe('leaving@example.com')
    expect(anonymized?.displayName).toBeNull()

    expect(await auth.sessions.resolve(session.token)).toBeNull()
    await expect(
      auth.login.passwordLogin('leaving@example.com', 'a real password here'),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('keeps the same id, so content attribution never breaks', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const leaving = await makeUser('leaving@example.com', ['editor'])

    await router().handle(
      request('POST', `/api/users/${leaving.id}/anonymize`, {
        confirmEmail: 'leaving@example.com',
      }),
      actorFor(admin.id, ['admin']),
    )

    expect((await auth.users.byId(leaving.id))?.id).toBe(leaving.id)
  })

  it('writes an audit entry, and it never carries the erased email', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const leaving = await makeUser('leaving@example.com', ['editor'])

    await router().handle(
      request('POST', `/api/users/${leaving.id}/anonymize`, {
        confirmEmail: 'leaving@example.com',
      }),
      actorFor(admin.id, ['admin']),
    )

    const entries = await auth.audit.list({ actorId: admin.id })
    const entry = entries.find((e) => e.action === 'user.anonymize' && e.entryId === leaving.id)
    expect(entry).toBeDefined()
    expect(JSON.stringify(entry)).not.toContain('leaving@example.com')
  })

  it('refuses without a matching confirmation email', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const leaving = await makeUser('leaving@example.com', ['editor'])

    const response = await router().handle(
      request('POST', `/api/users/${leaving.id}/anonymize`, { confirmEmail: 'wrong@example.com' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(400)
    expect(errorCodeOf(response)).toBe('AUTH_ANONYMIZE_CONFIRMATION_MISMATCH')
    expect((await auth.users.byId(leaving.id))?.status).toBe('active')
  })

  it('cannot be undone: PATCHing the account afterwards is refused', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const leaving = await makeUser('leaving@example.com', ['editor'])
    await router().handle(
      request('POST', `/api/users/${leaving.id}/anonymize`, {
        confirmEmail: 'leaving@example.com',
      }),
      actorFor(admin.id, ['admin']),
    )

    const response = await router().handle(
      request('PATCH', `/api/users/${leaving.id}`, { status: 'active' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(409)
    expect(errorCodeOf(response)).toBe('AUTH_ACCOUNT_ANONYMIZED')
  })

  it('refuses to anonymize the last active admin', async () => {
    const admin = await makeUser('root@example.com', ['admin'])

    const response = await router().handle(
      request('POST', `/api/users/${admin.id}/anonymize`, { confirmEmail: 'root@example.com' }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(403)
    expect((await auth.users.byId(admin.id))?.status).toBe('active')
  })

  it('refuses a non-admin', async () => {
    const editor = await makeUser('ed@example.com', ['editor'])
    const victim = await makeUser('victim@example.com', ['editor'])

    const response = await router().handle(
      request('POST', `/api/users/${victim.id}/anonymize`, { confirmEmail: 'victim@example.com' }),
      actorFor(editor.id, ['editor']),
    )
    expect(response.status).toBe(403)
    expect((await auth.users.byId(victim.id))?.status).toBe('active')
  })

  it('refuses to anonymize twice', async () => {
    const admin = await makeUser('root@example.com', ['admin'])
    const leaving = await makeUser('leaving@example.com', ['editor'])
    await router().handle(
      request('POST', `/api/users/${leaving.id}/anonymize`, {
        confirmEmail: 'leaving@example.com',
      }),
      actorFor(admin.id, ['admin']),
    )
    const anonymizedEmail = (await auth.users.byId(leaving.id))?.email as string

    const response = await router().handle(
      request('POST', `/api/users/${leaving.id}/anonymize`, { confirmEmail: anonymizedEmail }),
      actorFor(admin.id, ['admin']),
    )
    expect(response.status).toBe(409)
    expect(errorCodeOf(response)).toBe('AUTH_ACCOUNT_ANONYMIZED')
  })
})
