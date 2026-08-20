import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Contract G (ADR-0026, fiche 16) against a real server: the admin builds a
 * form, a visitor submits it with no JavaScript at all, the submission is
 * stored and notified, and the anti-abuse defences actually hold.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-forms-'))
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

async function adminToken(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

async function createContactForm(
  base: string,
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await fetch(`${base}/api/forms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'contact',
      label: 'Contact us',
      fields: [
        { name: 'email', label: 'E-mail', kind: 'email', required: true },
        { name: 'message', label: 'Message', kind: 'longText', required: true },
      ],
      notifyEmails: ['owner@example.com'],
      ...overrides,
    }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { data: { id: string; name: string } }).data
}

function extractHidden(html: string, name: string): string {
  const match = new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'u').exec(html)
  return match?.[1] ?? ''
}

/** A `_ts` old enough to clear the minimum-fill-delay check without a real test making a real wait. */
function staleTs(): string {
  return String(Date.now() - 10_000)
}

describe('cogenta serve — /api/forms and /forms/{name}', () => {
  it('lets an admin build a form, over a real server', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const created = await createContactForm(server.base, token)
      expect(created.name).toBe('contact')

      const listed = await fetch(`${server.base}/api/forms`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const body = (await listed.json()) as { data: readonly { name: string }[] }
      expect(body.data.map((f) => f.name)).toContain('contact')
    } finally {
      await server.stop()
    }
  })

  it('serves a real, accessible HTML page at the dedicated public route', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token)

      const page = await fetch(`${server.base}/forms/contact`)
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('<form')
      expect(html).toContain('action="/api/forms/contact/submit"')
      expect(html).toContain('name="email"')
      expect(html).toContain('name="_gotcha"')
      expect(html).toContain('name="_ts"')
    } finally {
      await server.stop()
    }
  })

  it('accepts a real, plain-HTML (no JavaScript) submission and redirects to a confirmation page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token)

      const body = new URLSearchParams({
        _gotcha: '',
        _ts: staleTs(),
        email: 'visitor@example.com',
        message: 'Hello from a plain browser form.',
      })

      const submit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        redirect: 'manual',
        body,
      })
      expect(submit.status).toBe(303)
      const location = submit.headers.get('location')
      expect(location).toBe('/forms/contact?submitted=1')

      const confirmation = await fetch(`${server.base}${location}`)
      expect(confirmation.status).toBe(200)
      expect(await confirmation.text()).toContain('Thank you')

      const list = await fetch(`${server.base}/api/forms/submissions`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const listed = (await list.json()) as { data: readonly { values: { email: string } }[] }
      expect(listed.data).toHaveLength(1)
      expect(listed.data[0]?.values.email).toBe('visitor@example.com')
    } finally {
      await server.stop()
    }
  })

  it("re-displays the visitor's own values, accessibly, when a plain-HTML submission fails validation — nothing typed is lost", async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token)

      const body = new URLSearchParams({
        _gotcha: '',
        _ts: staleTs(),
        email: 'not-an-email',
        message: 'A message worth keeping.',
      })

      const submit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        redirect: 'manual',
        body,
      })
      expect(submit.status).toBe(400)
      const html = await submit.text()
      // The value the visitor typed comes back, re-displayed — not dropped.
      expect(html).toContain('A message worth keeping.')
      expect(html).toContain('aria-invalid="true"')

      const list = await fetch(`${server.base}/api/forms/submissions`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const listed = (await list.json()) as { data: readonly unknown[] }
      expect(listed.data).toHaveLength(0)
    } finally {
      await server.stop()
    }
  })

  it('rejects a submission whose honeypot field was filled in', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token)

      const body = new URLSearchParams({
        _gotcha: 'I am a bot',
        _ts: staleTs(),
        email: 'a@b.com',
        message: 'hi',
      })

      const submit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        redirect: 'manual',
        body,
      })
      expect(submit.status).toBe(400)

      const list = await fetch(`${server.base}/api/forms/submissions`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(((await list.json()) as { data: readonly unknown[] }).data).toHaveLength(0)
    } finally {
      await server.stop()
    }
  })

  it('resists a submission loop from the same source (rate limit)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token)

      let last = 0
      for (let i = 0; i < 6; i += 1) {
        const submit = await fetch(`${server.base}/api/forms/contact/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            _gotcha: '',
            _ts: staleTs(),
            email: `visitor${i}@example.com`,
            message: 'hi',
          }),
        })
        last = submit.status
      }
      expect(last).toBe(429)
    } finally {
      await server.stop()
    }
  })

  it('accepts a JSON submission from a fetch-style client and answers JSON', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token)

      const submit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          _gotcha: '',
          _ts: staleTs(),
          email: 'visitor@example.com',
          message: 'hi',
        }),
      })
      expect(submit.status).toBe(201)
      const data = (await submit.json()) as { data: { status: string } }
      expect(data.data.status).toBe('submitted')
    } finally {
      await server.stop()
    }
  })

  it('sends a real notification e-mail via the file transport, never a second transport', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token)

      await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          _gotcha: '',
          _ts: staleTs(),
          email: 'visitor@example.com',
          message: 'hi',
        }),
      })

      const mailDir = join(root, '.cogenta', 'mail')
      const files = await readdir(mailDir)
      expect(files.length).toBeGreaterThan(0)
      const content = await readFile(join(mailDir, files[0] as string), 'utf8')
      expect(content).toContain('owner@example.com')
    } finally {
      await server.stop()
    }
  })

  it('refuses a non-admin managing forms', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'writer@example.com', 'correct horse battery staple', ['contributor'])
      const token = await loginWithMfaSetup(
        server.base,
        'writer@example.com',
        'correct horse battery staple',
      )

      const response = await fetch(`${server.base}/api/forms`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('404s the dedicated page for an unknown form', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/forms/does-not-exist`)
      expect(response.status).toBe(404)
    } finally {
      await server.stop()
    }
  })

  it("purges submissions past the form-configured retention automatically (GDPR, ADR-0022's retainDays/purgeExpired model)", async () => {
    const root = await project()
    // A fast tick so the test does not wait a day for the real cadence.
    const server = await startServer(root, { registry: activeServers, formsPurgeTickMs: 200 })
    try {
      const token = await adminToken(root, server.base)
      // retainDays: 0 — anything already stored is immediately past retention.
      await createContactForm(server.base, token, { retainDays: 0 })

      await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          _gotcha: '',
          _ts: String(Date.now() - 10_000),
          email: 'visitor@example.com',
          message: 'will be purged',
        }),
      })

      // `retainDays: 0` means the very next sweep (running every 200ms here)
      // already finds this submission past retention — the assertion is on
      // the eventual, purged state, not on catching it mid-flight.
      await waitFor(async () => {
        const after = await fetch(`${server.base}/api/forms/submissions`, {
          headers: { authorization: `Bearer ${token}` },
        })
        const body = (await after.json()) as { data: readonly unknown[] }
        if (body.data.length !== 0) throw new Error('not purged yet')
      })
    } finally {
      await server.stop()
    }
  })
})

async function waitFor(check: () => Promise<void>, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  for (;;) {
    try {
      await check()
      return
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
