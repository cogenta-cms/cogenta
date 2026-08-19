import { type AuthStore, createAuthStore } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RestRequest } from '../../src/rest/http.js'
import { createUsersRouter } from '../../src/rest/users-router.js'
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

function router() {
  return createUsersRouter({ auth })
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
