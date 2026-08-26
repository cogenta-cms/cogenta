import { Readable } from 'node:stream'
import type {
  ChannelAdapter,
  ChannelMessage,
  ChannelTarget,
  MessageId,
  OutgoingEmail,
  SentEmail,
} from '@cogenta/channels'
import { createChannelRegistry } from '@cogenta/channels'
import {
  createMemoryRateLimiter,
  createSqliteHandle,
  type DatabaseHandle,
  type RateLimitDriver,
  type StorageDriver,
  type StorageObjectInfo,
  type StoragePutOptions,
} from '@cogenta/core'
import {
  createFormStore,
  ensureFormsTables,
  type FormStore,
  HONEYPOT_FIELD,
  signFormFileToken,
  TIMESTAMP_FIELD,
  verifyFormFileToken,
} from '@cogenta/forms'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createFormsRouter,
  type FormsRequestContext,
  type FormsRouter,
  streamSubmissionsCsv,
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

/** A minimal in-memory `StorageDriver` — real behaviour, no service, exactly what R1 asks a degraded driver to be. */
function fakeStorage(): StorageDriver & { readonly written: Map<string, Buffer> } {
  const written = new Map<string, Buffer>()
  const info = new Map<string, StorageObjectInfo>()
  return {
    written,
    async put(key, data, options?: StoragePutOptions) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as unknown as Uint8Array)
      written.set(key, buffer)
      info.set(key, {
        key,
        size: buffer.length,
        contentType: options?.contentType,
        cacheControl: options?.cacheControl,
      })
    },
    async get(key) {
      const buffer = written.get(key)
      if (buffer === undefined) throw new Error(`no such key: ${key}`)
      return Readable.from(buffer)
    },
    async head(key) {
      return info.get(key) ?? null
    },
    async delete(key) {
      written.delete(key)
      info.delete(key)
    },
    async exists(key) {
      return written.has(key)
    },
    async signedUrl(key) {
      return `https://storage.example.com/${key}`
    },
    publicUrl(key) {
      return `https://storage.example.com/${key}`
    },
  }
}

function fakeChannelAdapter(name: string): ChannelAdapter & { readonly sent: ChannelMessage[] } {
  const sent: ChannelMessage[] = []
  return {
    name,
    sent,
    capabilities: {
      richText: false,
      buttons: false,
      threads: false,
      attachments: false,
      inbound: false,
    },
    async send(_target: ChannelTarget, message: ChannelMessage): Promise<MessageId> {
      sent.push(message)
      return `msg-${sent.length}`
    },
    async verifyIdentity() {
      throw new Error('not supported in this fake')
    },
  }
}

const TEST_FILE_SIGNING_SECRET = 'test-file-signing-secret-not-a-real-one'

function router(
  options: {
    withEmail?: boolean
    storage?: StorageDriver
    channelRegistry?: ReturnType<typeof createChannelRegistry>
    fileSigningSecret?: string
  } = {},
): FormsRouter {
  const withEmail = options.withEmail ?? true
  return createFormsRouter({
    forms,
    rateLimit,
    adminUrl: 'https://admin.example.com',
    now: () => clock,
    ...(withEmail ? { emailTransport: fakeTransport() } : {}),
    ...(options.storage === undefined ? {} : { storage: options.storage }),
    ...(options.channelRegistry === undefined ? {} : { channelRegistry: options.channelRegistry }),
    fileSigningSecret: options.fileSigningSecret ?? TEST_FILE_SIGNING_SECRET,
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
    const response = await router({ withEmail: false }).handle(
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

// ------------------------------------------------------------- fiche 47

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])
// An ELF binary's real magic bytes — never an image/document/pdf/text
// signature, whatever filename or Content-Type a request claims for it.
const ELF_BYTES = new Uint8Array([
  0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])

function multipartBody(
  fields: Record<string, string>,
  files: readonly { fieldName: string; filename: string; mimeType: string; data: Uint8Array }[],
): { fields: Record<string, string>; files: typeof files } {
  return { fields, files }
}

async function createFileForm() {
  return forms.definitions.create({
    name: 'apply',
    label: 'Apply',
    fields: [
      { name: 'email', label: 'E-mail', kind: 'email', required: true },
      { name: 'resume', label: 'Resume', kind: 'file', required: true },
    ],
  })
}

describe('file field — fiche 47 task 3', () => {
  it('sniffs, stores, and records a real upload — a security-critical route treated as one', async () => {
    await createFileForm()
    const storage = fakeStorage()
    const response = await router({ storage }).handle(
      request('POST', '/api/forms/apply/submit', {
        body: multipartBody(
          { [HONEYPOT_FIELD]: '', [TIMESTAMP_FIELD]: String(clock - 5_000), email: 'a@b.com' },
          [{ fieldName: 'resume', filename: 'resume.png', mimeType: 'image/png', data: PNG_BYTES }],
        ),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(201)
    expect(storage.written.size).toBe(1)

    const list = await forms.submissions.list()
    const stored = list.items[0]?.values['resume'] as { filename: string; storageKey: string }
    expect(stored.filename).toBe('resume.png')
    expect(storage.written.has(stored.storageKey)).toBe(true)
  })

  it('refuses a file whose bytes contradict what it claims to be — never trusts filename or declared Content-Type', async () => {
    await createFileForm()
    const storage = fakeStorage()
    const response = await router({ storage }).handle(
      request('POST', '/api/forms/apply/submit', {
        body: multipartBody(
          { [HONEYPOT_FIELD]: '', [TIMESTAMP_FIELD]: String(clock - 5_000), email: 'a@b.com' },
          [
            {
              fieldName: 'resume',
              filename: 'resume.docx',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              data: ELF_BYTES,
            },
          ],
        ),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('FORM_FILE_REJECTED')
    // Nothing was ever written to storage for a refused upload.
    expect(storage.written.size).toBe(0)
  })

  it('refuses a file upload outright when the site has no storage configured', async () => {
    await createFileForm()
    const response = await router({}).handle(
      request('POST', '/api/forms/apply/submit', {
        body: multipartBody(
          { [HONEYPOT_FIELD]: '', [TIMESTAMP_FIELD]: String(clock - 5_000), email: 'a@b.com' },
          [{ fieldName: 'resume', filename: 'r.png', mimeType: 'image/png', data: PNG_BYTES }],
        ),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('FORM_FILE_REJECTED')
  })

  // Security review finding (bloquant): a plain JSON submission could hand
  // `resume` a hand-crafted `{filename, mimeType, size, storageKey}` object
  // directly — no multipart part, no real upload, no byte ever sniffed —
  // and the old code trusted it outright because `isFormFileValue` only
  // checks shape. `resolveFileFields` must never accept a raw object for a
  // `file` field unless it came from a real upload this exact call made.
  it('never accepts a forged file value with no real upload behind it (JSON body)', async () => {
    await createFileForm()
    const storage = fakeStorage()
    const response = await router({ storage }).handle(
      request('POST', '/api/forms/apply/submit', {
        body: {
          [HONEYPOT_FIELD]: '',
          [TIMESTAMP_FIELD]: String(clock - 5_000),
          email: 'a@b.com',
          resume: {
            filename: 'totally-legit.pdf',
            mimeType: 'application/pdf',
            size: 1,
            storageKey: 'forms/someone-elses-form/x/y/secret.pdf',
          },
        },
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(400)
    expect(storage.written.size).toBe(0)
    expect(await forms.submissions.list()).toMatchObject({ items: [] })
  })

  // Same forgery attempt, but urlencoded — the field's value arrives as a
  // JSON-encoded *string* rather than a nested object. Before signing, this
  // one actually worked (`typeof carried === 'string'` + `JSON.parse` +
  // `isFormFileValue` all passed): the fix must close it too, not just the
  // JSON-object variant.
  it('never accepts a forged file value carried as an unsigned JSON string', async () => {
    await createFileForm()
    const storage = fakeStorage()
    const forged = JSON.stringify({
      filename: 'totally-legit.pdf',
      mimeType: 'application/pdf',
      size: 1,
      storageKey: 'forms/someone-elses-form/x/y/secret.pdf',
    })
    // `request.body` here is already the parsed shape `serve.ts`'s `readBody`
    // would hand the router for a real urlencoded POST — a plain object
    // whose `resume` value is the JSON text itself, still just a string.
    const response = await router({ storage }).handle(
      request('POST', '/api/forms/apply/submit', {
        body: {
          [HONEYPOT_FIELD]: '',
          [TIMESTAMP_FIELD]: String(clock - 5_000),
          email: 'a@b.com',
          resume: forged,
        },
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(400)
    expect(storage.written.size).toBe(0)
  })

  it('accepts a real file value signed by this router and carried forward, and rejects a tampered one', async () => {
    const form = await createFileForm()
    const storage = fakeStorage()
    const genuine = {
      filename: 'resume.png',
      mimeType: 'image/png',
      size: 12,
      storageKey: 'forms/real-form-id/real-upload-id/resume.png',
    }
    const context = { formId: form.id, fieldName: 'resume' }
    const signed = signFormFileToken(TEST_FILE_SIGNING_SECRET, context, genuine)

    // A genuinely signed token is accepted (shape ends up identical to the
    // signed value — the router trusts its own signature).
    const accepted = await router({ storage }).handle(
      request('POST', '/api/forms/apply/submit', {
        body: {
          [HONEYPOT_FIELD]: '',
          [TIMESTAMP_FIELD]: String(clock - 5_000),
          email: 'a@b.com',
          resume: signed,
        },
      }),
      AS_ANONYMOUS,
    )
    expect(accepted.status).toBe(201)
    const list = await forms.submissions.list()
    expect(list.items[0]?.values['resume']).toEqual(genuine)

    // Flipping one character in the signed payload must be rejected, not
    // silently accepted with a mutated file value.
    const tampered = `${signed.slice(0, -1)}${signed.endsWith('a') ? 'b' : 'a'}`
    expect(verifyFormFileToken(TEST_FILE_SIGNING_SECRET, context, tampered)).toBeNull()
  })

  it('refuses a token signed for a different field — closes the cross-field replay a second security review found', async () => {
    const form = await createFileForm()
    const storage = fakeStorage()
    const genuine = {
      filename: 'resume.png',
      mimeType: 'image/png',
      size: 12,
      storageKey: 'forms/real-form-id/real-upload-id/resume.png',
    }
    // Signed for a *different* field on the same form.
    const wrongFieldToken = signFormFileToken(
      TEST_FILE_SIGNING_SECRET,
      { formId: form.id, fieldName: 'some-other-field' },
      genuine,
    )
    const response = await router({ storage }).handle(
      request('POST', '/api/forms/apply/submit', {
        body: {
          [HONEYPOT_FIELD]: '',
          [TIMESTAMP_FIELD]: String(clock - 5_000),
          email: 'a@b.com',
          resume: wrongFieldToken,
        },
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(400)
    expect(await forms.submissions.list()).toMatchObject({ items: [] })
  })
})

describe('multi-step forms — fiche 47 task 2, no JavaScript required', () => {
  async function createStepForm() {
    return forms.definitions.create({
      name: 'apply',
      label: 'Apply',
      fields: [
        { name: 'email', label: 'E-mail', kind: 'email', required: true },
        { name: 'message', label: 'Message', kind: 'longText', required: true },
      ],
      steps: [
        { name: 'step1', label: 'Contact', fieldNames: ['email'] },
        { name: 'step2', label: 'Message', fieldNames: ['message'] },
      ],
    })
  }

  it('answers a partial step without ever creating a submission', async () => {
    await createStepForm()
    const response = await router().handle(
      request('POST', '/api/forms/apply/submit', {
        body: {
          [HONEYPOT_FIELD]: '',
          [TIMESTAMP_FIELD]: String(clock - 5_000),
          _step: '0',
          email: 'a@b.com',
        },
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(202)
    const body = response.body as {
      data: { status: string; nextStep: number; values: Record<string, unknown> }
    }
    expect(body.data.status).toBe('step')
    expect(body.data.nextStep).toBe(1)
    expect(body.data.values['email']).toBe('a@b.com')
    expect(await forms.submissions.list()).toMatchObject({ items: [] })
  })

  it('creates the real submission only on the final step, with every earlier step carried forward', async () => {
    await createStepForm()
    const first = await router().handle(
      request('POST', '/api/forms/apply/submit', {
        body: {
          [HONEYPOT_FIELD]: '',
          [TIMESTAMP_FIELD]: String(clock - 5_000),
          _step: '0',
          email: 'a@b.com',
        },
      }),
      AS_ANONYMOUS,
    )
    const accumulated = JSON.stringify(
      (first.body as { data: { values: Record<string, unknown> } }).data.values,
    )

    const final = await router().handle(
      request('POST', '/api/forms/apply/submit', {
        body: {
          [HONEYPOT_FIELD]: '',
          [TIMESTAMP_FIELD]: String(clock - 5_000),
          _step: '1',
          _accumulated: accumulated,
          message: 'Hello there',
        },
      }),
      AS_ANONYMOUS,
    )
    expect(final.status).toBe(201)

    const list = await forms.submissions.list()
    expect(list.items).toHaveLength(1)
    expect(list.items[0]?.values).toEqual({ email: 'a@b.com', message: 'Hello there' })
  })

  it('a tampered/corrupted _accumulated does not smuggle in an already-required earlier field — the final step still fails validation honestly', async () => {
    await createStepForm()
    const final = await router().handle(
      request('POST', '/api/forms/apply/submit', {
        body: {
          [HONEYPOT_FIELD]: '',
          [TIMESTAMP_FIELD]: String(clock - 5_000),
          _step: '1',
          _accumulated: '{not valid json',
          message: 'Hello there',
        },
      }),
      AS_ANONYMOUS,
    )
    expect(final.status).toBe(400)
  })
})

describe('multi-channel notifications — fiche 47 task 4', () => {
  it('sends a submission alert through every configured channel', async () => {
    const slack = fakeChannelAdapter('slack')
    const registry = createChannelRegistry([slack])
    await createContactForm({ notifyChannels: [{ channel: 'slack', target: 'C123' }] })

    const response = await router({ channelRegistry: registry }).handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(201)
    expect(slack.sent).toHaveLength(1)
  })

  it('never fails the submission when a configured channel is not actually registered on this site (R1)', async () => {
    await createContactForm({ notifyChannels: [{ channel: 'slack', target: 'C123' }] })
    const response = await router({ channelRegistry: createChannelRegistry([]) }).handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(201)
  })

  it('only admin may configure which channels a form notifies', async () => {
    const created = await createContactForm()
    const response = await router().handle(
      request('PATCH', `/api/forms/${created.id}`, {
        body: { notifyChannels: [{ channel: 'slack', target: 'C999' }] },
      }),
      AS_CONTRIBUTOR,
    )
    expect(response.status).toBe(403)
    expect((await forms.definitions.read(created.id))?.notifyChannels).toEqual([])
  })
})

describe('CAPTCHA — fiche 47 task 10, off by default', () => {
  it('a form with the CAPTCHA disabled (the default) never needs a token', async () => {
    await createContactForm()
    const response = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(201)
  })

  it('refuses the final submission with no token once a form enables the CAPTCHA', async () => {
    await createContactForm({ captcha: { enabled: true, siteKey: 's', secretKey: 'k' } })
    const response = await router().handle(
      request('POST', '/api/forms/contact/submit', {
        body: honestBody({ email: 'a@b.com', message: 'hi' }),
      }),
      AS_ANONYMOUS,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('FORM_CAPTCHA_REQUIRED')
  })
})

describe('duplicating a form — fiche 47 task 11', () => {
  it('creates an independent, inactive copy via POST /api/forms/{id}/duplicate', async () => {
    const created = await createContactForm()
    const response = await router().handle(
      request('POST', `/api/forms/${created.id}/duplicate`),
      AS_ADMIN,
    )
    expect(response.status).toBe(201)
    const copy = (response.body as { data: { id: string; name: string; active: boolean } }).data
    expect(copy.id).not.toBe(created.id)
    expect(copy.active).toBe(false)
  })

  it('is admin-only', async () => {
    const created = await createContactForm()
    const response = await router().handle(
      request('POST', `/api/forms/${created.id}/duplicate`),
      AS_CONTRIBUTOR,
    )
    expect(response.status).toBe(403)
  })
})

describe('submission search/date filters and notes — fiche 47 tasks 7-8', () => {
  it('filters submissions by free-text query', async () => {
    await createContactForm()
    await forms.submissions.submit('contact', { email: 'a@b.com', message: 'billing question' })
    await forms.submissions.submit('contact', { email: 'c@d.com', message: 'general question' })

    const response = await router().handle(
      request('GET', '/api/forms/submissions', { query: { q: 'billing' } }),
      AS_ADMIN,
    )
    expect((response.body as { data: unknown[] }).data).toHaveLength(1)
  })

  it('filters submissions by date range', async () => {
    await createContactForm()
    await forms.submissions.submit('contact', { email: 'old@b.com', message: 'hi' })
    clock += 10 * 24 * 60 * 60 * 1000
    await forms.submissions.submit('contact', { email: 'new@b.com', message: 'hi' })

    const cutoff = new Date(clock - 5 * 24 * 60 * 60 * 1000).toISOString()
    const response = await router().handle(
      request('GET', '/api/forms/submissions', { query: { from: cutoff } }),
      AS_ADMIN,
    )
    const items = (response.body as { data: { values: { email: string } }[] }).data
    expect(items).toHaveLength(1)
    expect(items[0]?.values.email).toBe('new@b.com')
  })

  it('adds and lists a note on a submission, admin-only', async () => {
    await createContactForm()
    const submission = await forms.submissions.submit('contact', {
      email: 'a@b.com',
      message: 'hi',
    })

    const refused = await router().handle(
      request('POST', `/api/forms/submissions/${submission.id}/notes`, { body: { body: 'nope' } }),
      AS_CONTRIBUTOR,
    )
    expect(refused.status).toBe(403)

    const added = await router().handle(
      request('POST', `/api/forms/submissions/${submission.id}/notes`, {
        body: { body: 'Called back, no answer.' },
      }),
      AS_ADMIN,
    )
    expect(added.status).toBe(201)

    const listed = await router().handle(
      request('GET', `/api/forms/submissions/${submission.id}/notes`),
      AS_ADMIN,
    )
    const notes = (listed.body as { data: { body: string }[] }).data
    expect(notes).toHaveLength(1)
    expect(notes[0]?.body).toBe('Called back, no answer.')
  })
})

describe('streamSubmissionsCsv — fiche 47 task 9', () => {
  async function collect(iterable: AsyncGenerator<string>): Promise<string> {
    let out = ''
    for await (const chunk of iterable) out += chunk
    return out
  }

  it('streams a header plus one row per submission, never building the whole thing in memory first', async () => {
    await createContactForm()
    await forms.submissions.submit('contact', { email: 'a@b.com', message: 'hi' })
    await forms.submissions.submit('contact', { email: 'c@d.com', message: 'hello' })

    const csv = await collect(streamSubmissionsCsv(forms, {}))
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(3) // header + 2 rows
    expect(lines[0]).toContain('email')
  })

  it('still guards a formula-leading value (CWE-1236) after streaming — the non-regression this task requires', async () => {
    await createContactForm()
    await forms.submissions.submit('contact', {
      email: 'a@b.com',
      message: '=cmd|/c calc',
    })

    const csv = await collect(streamSubmissionsCsv(forms, {}))
    expect(csv).toContain("'=cmd|/c calc")
    expect(csv).not.toContain(',=cmd|/c calc')
  })
})
