import type { OutgoingEmail, SentEmail } from '@cogenta/channels'
import {
  createMemoryRateLimiter,
  createSqliteHandle,
  type DatabaseHandle,
  type RateLimitDriver,
} from '@cogenta/core'
import {
  createFormStore,
  ensureFormsTables,
  type FormStore,
  HONEYPOT_FIELD,
  TIMESTAMP_FIELD,
} from '@cogenta/forms'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createFormsRouter,
  type FormsRequestContext,
  type FormsRouter,
} from '../../src/rest/forms-router.js'
import type { RestRequest } from '../../src/rest/http.js'
import { type Actor, ANONYMOUS } from '../../src/types.js'

const ADMIN: Actor = { id: 'user-1', roles: ['admin'] }
const CONTRIBUTOR: Actor = { id: 'user-2', roles: ['contributor'] }

function ctx(actor: Actor, ip = '203.0.113.1'): FormsRequestContext {
  return { actor, ip }
}
const AS_ADMIN = ctx(ADMIN)
const AS_CONTRIBUTOR = ctx(CONTRIBUTOR)
const AS_ANONYMOUS = ctx(ANONYMOUS)

let db: DatabaseHandle
let forms: FormStore
let rateLimit: RateLimitDriver
let clock: number
let sentEmails: OutgoingEmail[]

function fakeTransport(): { send(email: OutgoingEmail): Promise<SentEmail> } {
  return {
    send: async (email) => {
      sentEmails.push(email)
      return { messageId: `msg-${sentEmails.length}` }
    },
  }
}

function router(withEmail = true): FormsRouter {
  return createFormsRouter({
    forms,
    rateLimit,
    adminUrl: 'https://admin.example.com',
    now: () => clock,
    ...(withEmail ? { emailTransport: fakeTransport() } : {}),
  })
}

function request(
  method: string,
  path: string,
  options: {
    body?: unknown
    query?: Record<string, string>
    headers?: Record<string, string>
  } = {},
): RestRequest {
  return {
    method,
    path,
    query: options.query ?? {},
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  }
}

beforeEach(async () => {
  clock = Date.parse('2026-01-01T00:00:00.000Z')
  db = await createSqliteHandle({ url: ':memory:' })
  await ensureFormsTables(db)
  forms = createFormStore(db, () => clock)
  rateLimit = createMemoryRateLimiter({ now: () => clock })
  sentEmails = []
})

afterEach(async () => {
  await db.close()
})

async function createContactForm(
  overrides: Partial<Parameters<FormStore['definitions']['create']>[0]> = {},
) {
  return forms.definitions.create({
    name: 'contact',
    label: 'Contact us',
    fields: [
      { name: 'email', label: 'E-mail', kind: 'email', required: true },
      { name: 'message', label: 'Message', kind: 'longText', required: true },
    ],
    notifyEmails: ['owner@example.com'],
    ...overrides,
  })
}

function honestBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { [HONEYPOT_FIELD]: '', [TIMESTAMP_FIELD]: String(clock - 5_000), ...extra }
}

describe('permissions — definitions and submissions are admin-only', () => {
  it('refuses a non-admin listing forms', async () => {
    const response = await router().handle(request('GET', '/api/forms'), AS_CONTRIBUTOR)
    expect(response.status).toBe(403)
  })

  it('refuses an anonymous actor listing forms', async () => {
    const response = await router().handle(request('GET', '/api/forms'), AS_ANONYMOUS)
    expect(response.status).toBe(403)
  })

  it('lets admin list forms', async () => {
    await createContactForm()
    const response = await router().handle(request('GET', '/api/forms'), AS_ADMIN)
    expect(response.status).toBe(200)
  })

  it('refuses a non-admin listing submissions', async () => {
    const response = await router().handle(request('GET', '/api/forms/submissions'), AS_CONTRIBUTOR)
    expect(response.status).toBe(403)
  })

  it('the public submit route needs no actor role at all', async () => {
    await createContactForm()
    const response = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'Hi' }),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(201)
  })
})

describe('definitions CRUD', () => {
  it('creates a form via POST /api/forms', async () => {
    const response = await router().handle(
      request('POST', '/api/forms', {
        body: {
          name: 'newsletter',
          label: 'Newsletter',
          fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
        },
      }),
      AS_ADMIN,
    )
    expect(response.status).toBe(201)
    const body = response.body as { data: { name: string } }
    expect(body.data.name).toBe('newsletter')
  })

  it('updates a form', async () => {
    const created = await createContactForm()
    const response = await router().handle(
      request('PATCH', `/api/forms/${created.id}`, { body: { label: 'New label' } }),
      AS_ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { label: string } }).data.label).toBe('New label')
  })

  it('deletes a form', async () => {
    const created = await createContactForm()
    const response = await router().handle(request('DELETE', `/api/forms/${created.id}`), AS_ADMIN)
    expect(response.status).toBe(204)
    expect(await forms.definitions.read(created.id)).toBeNull()
  })

  it('404s reading an unknown form', async () => {
    const response = await router().handle(request('GET', '/api/forms/does-not-exist'), AS_ADMIN)
    expect(response.status).toBe(404)
  })
})

describe('POST /api/forms/{name}/submit — the public write route', () => {
  it('stores a valid submission and notifies the configured recipient', async () => {
    await createContactForm()
    const response = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'visitor@example.com', message: 'Hello' }),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(201)
    expect(sentEmails).toHaveLength(1)
    expect(sentEmails[0]?.to).toBe('owner@example.com')

    const list = await forms.submissions.list()
    expect(list.items).toHaveLength(1)
  })

  it('works with no JavaScript: a plain urlencoded-shaped body, answered with JSON carrying a redirect target', async () => {
    await createContactForm({ redirectTo: '/thank-you' })
    const response = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'visitor@example.com', message: 'Hello' }),
      }),
      AS_ANONYMOUS,
    )
    const body = response.body as { data: { redirectTo: string | null } }
    expect(body.data.redirectTo).toBe('/thank-you')
  })

  it('rejects a request whose honeypot field was filled in', async () => {
    await createContactForm()
    const response = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: {
          [HONEYPOT_FIELD]: 'bot-filled-this',
          [TIMESTAMP_FIELD]: String(clock - 5_000),
          email: 'a@b.com',
          message: 'hi',
        },
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(400)
    expect(await forms.submissions.list()).toMatchObject({ items: [] })
  })

  it('rejects a submission that arrives faster than a human could fill the form', async () => {
    await createContactForm()
    const response = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: {
          [HONEYPOT_FIELD]: '',
          [TIMESTAMP_FIELD]: String(clock - 100),
          email: 'a@b.com',
          message: 'hi',
        },
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(400)
  })

  it('resists a submission loop from the same source', async () => {
    await createContactForm()
    const source = ctx(ANONYMOUS, '203.0.113.5')
    for (let i = 0; i < 5; i += 1) {
      const response = await router().handle(
        request('POST', '/api/forms/contact/submit', {
          body: honestBody({ email: 'a@b.com', message: 'hi' }),
        }),
        source,
      )
      expect(response.status).toBe(201)
    }
    const blocked = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
      }),
      source,
    )
    expect(blocked.status).toBe(429)
  })

  it('reads the client IP from the resolved request context, never from a client-supplied header — a spoofed X-Forwarded-For cannot bypass the rate limit', async () => {
    await createContactForm()
    const fixedSource = ctx(ANONYMOUS, '203.0.113.9')
    for (let i = 0; i < 5; i += 1) {
      const response = await router().handle(
        request('POST', '/api/forms/contact/submit', {
          body: honestBody({ email: 'a@b.com', message: 'hi' }),
          // A different, attacker-controlled value on every request — if the
          // router trusted this header instead of `context.ip`, each of
          // these would land in its own rate-limit bucket and never trip
          // the limiter at all.
          headers: { 'x-forwarded-for': `198.51.100.${i}` },
        }),
        fixedSource,
      )
      expect(response.status).toBe(201)
    }
    const blocked = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
        headers: { 'x-forwarded-for': '198.51.100.250' },
      }),
      fixedSource,
    )
    expect(blocked.status).toBe(429)
  })

  it('keeps two different sources independent', async () => {
    await createContactForm()
    for (let i = 0; i < 5; i += 1) {
      await router().handle(
        request('POST', '/api/forms/contact/submit', {
          body: honestBody({ email: 'a@b.com', message: 'hi' }),
        }),
        ctx(ANONYMOUS, '203.0.113.10'),
      )
    }
    const other = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
      }),
      ctx(ANONYMOUS, '203.0.113.11'),
    )
    expect(other.status).toBe(201)
  })

  it('never stores the submitting IP in the clear', async () => {
    await createContactForm()
    await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
      }),
      ctx(ANONYMOUS, '198.51.100.42'),
    )
    const list = await forms.submissions.list()
    const stored = JSON.stringify(list.items)
    expect(stored).not.toContain('198.51.100.42')
  })

  it('rejects a submission missing a required field, independent of any client-side check', async () => {
    await createContactForm()
    const response = await router().handle(
      request('POST', '/api/forms/contact/submit', { body: honestBody({ email: 'a@b.com' }) }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(400)
  })

  it('404s submitting to an unknown form', async () => {
    const response = await router().handle(
      request('POST', '/api/forms/nope/submit', { body: honestBody() }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(404)
  })

  it('refuses a submission to a disabled form', async () => {
    await createContactForm({ active: false })
    const response = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(409)
  })

  it('still stores the submission when no e-mail transport is configured (R1/R2)', async () => {
    await createContactForm()
    const response = await router(false).handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(201)
    expect(await forms.submissions.list()).toMatchObject({ items: [expect.anything()] })
  })
})

describe('submissions management', () => {
  it('marks a submission read', async () => {
    await createContactForm()
    const submission = await forms.submissions.submit('contact', {
      email: 'a@b.com',
      message: 'hi',
    })
    const response = await router().handle(
      request('PATCH', `/api/forms/submissions/${submission.id}`, { body: { status: 'read' } }),
      AS_ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { status: string } }).data.status).toBe('read')
  })

  it('bulk-marks several submissions as spam', async () => {
    await createContactForm()
    const one = await forms.submissions.submit('contact', { email: 'a@b.com', message: 'hi' })
    const two = await forms.submissions.submit('contact', { email: 'c@d.com', message: 'hi' })
    const response = await router().handle(
      request('POST', '/api/forms/submissions/bulk', {
        body: { ids: [one.id, two.id], action: 'spam' },
      }),
      AS_ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { updated: number } }).data.updated).toBe(2)
  })

  it('reports the unread count for the nav badge', async () => {
    await createContactForm()
    await forms.submissions.submit('contact', { email: 'a@b.com', message: 'hi' })
    const response = await router().handle(
      request('GET', '/api/forms/submissions/unread-count'),
      AS_ADMIN,
    )
    expect((response.body as { data: { count: number } }).data.count).toBe(1)
  })

  it('finds a submission by e-mail (GDPR search)', async () => {
    await createContactForm()
    await forms.submissions.submit('contact', { email: 'target@example.com', message: 'hi' })
    const response = await router().handle(
      request('GET', '/api/forms/submissions/search', { query: { email: 'target@example.com' } }),
      AS_ADMIN,
    )
    expect((response.body as { data: unknown[] }).data).toHaveLength(1)
  })

  it('erases every submission by e-mail on request (GDPR)', async () => {
    await createContactForm()
    await forms.submissions.submit('contact', { email: 'erase-me@example.com', message: 'hi' })
    const response = await router().handle(
      request('DELETE', '/api/forms/submissions/by-email', {
        query: { email: 'erase-me@example.com' },
      }),
      AS_ADMIN,
    )
    expect((response.body as { data: { erased: number } }).data.erased).toBe(1)
  })

  it("exposes stored XSS as a plain string, unexecuted — escaping is the admin renderer's job", async () => {
    await createContactForm()
    const payload = '<img src=x onerror=alert(1)>'
    const submission = await forms.submissions.submit('contact', {
      email: 'a@b.com',
      message: payload,
    })
    const response = await router().handle(
      request('GET', `/api/forms/submissions/${submission.id}`),
      AS_ADMIN,
    )
    const body = response.body as { data: { values: { message: string } } }
    expect(body.data.values.message).toBe(payload)
  })
})
