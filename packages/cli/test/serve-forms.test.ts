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

function unescapeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
}

function extractHidden(html: string, name: string): string {
  const match = new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'u').exec(html)
  return unescapeHtmlAttribute(match?.[1] ?? '')
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

      // L20 audit, points 8-9: `/forms/{name}` used to build its own thin
      // `<html>` shell, carrying the stylesheet link but none of the markup
      // the theme's own selectors target — the page loaded the stylesheet
      // and still rendered unstyled. It now goes through the same
      // `renderPageChrome` every collection page does.
      expect(html).toContain('class="cg-skip-link"')
      expect(html).toContain('name="color-scheme"')
      expect(html).toContain('class="cg-site-header"')
      expect(html).toContain('class="cg-site-footer"')
      expect(html).toContain('href="/_cogenta/styles.css"')
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

// ------------------------------------------------------------- fiche 47

describe('cogenta serve — fiche 47: logic, steps, files, CSV export', () => {
  it('never requires or validates a field masked by an unmet showIf condition, with no JavaScript at all', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token, {
        fields: [
          { name: 'email', label: 'E-mail', kind: 'email', required: true },
          {
            name: 'contactMethod',
            label: 'Contact method',
            kind: 'choiceSingle',
            required: true,
            choices: ['email', 'phone'],
          },
          {
            name: 'phone',
            label: 'Phone',
            kind: 'phone',
            required: true,
            showIf: { field: 'contactMethod', operator: 'equals', value: 'phone' },
          },
        ],
      })

      // "phone" would fail (not a real phone number) and is required — but
      // its condition (contactMethod === "phone") is unmet.
      const body = new URLSearchParams({
        _gotcha: '',
        _ts: staleTs(),
        email: 'visitor@example.com',
        contactMethod: 'email',
        phone: 'nonsense',
      })
      const submit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        redirect: 'manual',
        body,
      })
      expect(submit.status).toBe(303)

      const list = await fetch(`${server.base}/api/forms/submissions`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const listed = (await list.json()) as {
        data: readonly { values: Record<string, unknown> }[]
      }
      expect(listed.data[0]?.values['phone']).toBeUndefined()
    } finally {
      await server.stop()
    }
  })

  it('walks a real multi-step form to completion with no JavaScript: plain chained POSTs, one real submission at the end', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token, {
        steps: [
          { name: 'step1', label: 'Contact', fieldNames: ['email'] },
          { name: 'step2', label: 'Message', fieldNames: ['message'] },
        ],
      })

      // Step 0: the dedicated page shows only the first step's field.
      const stepOnePage = await fetch(`${server.base}/forms/contact`)
      const stepOneHtml = await stepOnePage.text()
      expect(stepOneHtml).toContain('name="email"')
      expect(stepOneHtml).not.toContain('name="message"')
      expect(stepOneHtml).toContain('name="_step"')

      const stepOneSubmit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          _gotcha: '',
          _ts: staleTs(),
          _step: '0',
          email: 'visitor@example.com',
        }),
      })
      expect(stepOneSubmit.status).toBe(200)
      const stepTwoHtml = await stepOneSubmit.text()
      // No redirect between steps — the next step is rendered directly.
      expect(stepTwoHtml).toContain('name="message"')
      expect(stepTwoHtml).not.toContain('name="email"')
      const accumulated = extractHidden(stepTwoHtml, '_accumulated')
      expect(JSON.parse(accumulated)).toMatchObject({ email: 'visitor@example.com' })
      const carriedTs = extractHidden(stepTwoHtml, '_ts')

      const finalSubmit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        redirect: 'manual',
        body: new URLSearchParams({
          _gotcha: '',
          _ts: carriedTs,
          _step: '1',
          _accumulated: accumulated,
          message: 'Hello from step two.',
        }),
      })
      expect(finalSubmit.status).toBe(303)

      const list = await fetch(`${server.base}/api/forms/submissions`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const listed = (await list.json()) as {
        data: readonly { values: Record<string, unknown> }[]
      }
      expect(listed.data).toHaveLength(1)
      expect(listed.data[0]?.values).toEqual({
        email: 'visitor@example.com',
        message: 'Hello from step two.',
      })
    } finally {
      await server.stop()
    }
  })

  it('accepts a real file upload, sniffed and stored, over a real multipart/form-data POST with no JavaScript', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token, {
        fields: [
          { name: 'email', label: 'E-mail', kind: 'email', required: true },
          { name: 'resume', label: 'Resume', kind: 'file', required: true },
        ],
      })

      const page = await fetch(`${server.base}/forms/contact`)
      const html = await page.text()
      expect(html).toContain('type="file"')
      expect(html).toContain('enctype="multipart/form-data"')

      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
      const form = new FormData()
      form.set('_gotcha', '')
      form.set('_ts', staleTs())
      form.set('email', 'visitor@example.com')
      form.set('resume', new Blob([png], { type: 'image/png' }), 'resume.png')

      const submit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        redirect: 'manual',
        body: form,
      })
      expect(submit.status).toBe(303)

      const list = await fetch(`${server.base}/api/forms/submissions`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const listed = (await list.json()) as {
        data: readonly { values: { resume: { filename: string; storageKey: string } } }[]
      }
      expect(listed.data[0]?.values.resume.filename).toBe('resume.png')
      expect(listed.data[0]?.values.resume.storageKey).toContain('forms/')
    } finally {
      await server.stop()
    }
  })

  it('refuses a file whose real bytes are not one of the accepted categories, over the real multipart route', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token, {
        fields: [
          { name: 'email', label: 'E-mail', kind: 'email', required: true },
          { name: 'resume', label: 'Resume', kind: 'file', required: true },
        ],
      })

      // An ELF binary's real magic bytes, dressed up as a .pdf.
      const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      const form = new FormData()
      form.set('_gotcha', '')
      form.set('_ts', staleTs())
      form.set('email', 'visitor@example.com')
      form.set('resume', new Blob([elf], { type: 'application/pdf' }), 'resume.pdf')

      const submit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        body: form,
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

  it('streams a CSV export, admin-only, still guarding a formula-leading value (CWE-1236)', async () => {
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
          email: 'a@b.com',
          message: '=cmd|/c calc',
        }),
      })

      const anonymous = await fetch(`${server.base}/api/forms/submissions/export.csv`)
      expect(anonymous.status).toBe(403)

      const exported = await fetch(`${server.base}/api/forms/submissions/export.csv`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(exported.status).toBe(200)
      expect(exported.headers.get('content-type')).toContain('text/csv')
      const csv = await exported.text()
      expect(csv).toContain("'=cmd|/c calc")
      expect(csv).not.toContain(',=cmd|/c calc')
    } finally {
      await server.stop()
    }
  })

  it('duplicates a form as an independent, inactive copy via the admin API', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const created = await createContactForm(server.base, token)

      const response = await fetch(`${server.base}/api/forms/${created.id}/duplicate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(201)
      const copy = (await response.json()) as { data: { id: string; active: boolean } }
      expect(copy.data.id).not.toBe(created.id)
      expect(copy.data.active).toBe(false)
    } finally {
      await server.stop()
    }
  })

  it('carries a real uploaded file across a multi-step form, and refuses a tampered carried value', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createContactForm(server.base, token, {
        fields: [
          { name: 'email', label: 'E-mail', kind: 'email', required: true },
          { name: 'resume', label: 'Resume', kind: 'file', required: true },
          { name: 'message', label: 'Message', kind: 'longText', required: true },
        ],
        steps: [
          { name: 'step1', label: 'Contact', fieldNames: ['email', 'resume'] },
          { name: 'step2', label: 'Message', fieldNames: ['message'] },
        ],
      })

      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
      const step1Form = new FormData()
      step1Form.set('_gotcha', '')
      step1Form.set('_ts', staleTs())
      step1Form.set('_step', '0')
      step1Form.set('email', 'visitor@example.com')
      step1Form.set('resume', new Blob([png], { type: 'image/png' }), 'resume.png')

      const step1Submit = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        body: step1Form,
      })
      expect(step1Submit.status).toBe(200)
      const step2Html = await step1Submit.text()
      const accumulated = extractHidden(step2Html, '_accumulated')
      const parsedAccumulated = JSON.parse(accumulated) as Record<string, unknown>
      // The file value carried in the hidden field is a signed token, never
      // the raw {filename, mimeType, size, storageKey} object — closing the
      // forgery hole a security review of this exact flow found.
      expect(typeof parsedAccumulated['resume']).toBe('string')
      const carriedTs = extractHidden(step2Html, '_ts')

      const legitimateFinal = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        redirect: 'manual',
        body: new URLSearchParams({
          _gotcha: '',
          _ts: carriedTs,
          _step: '1',
          _accumulated: accumulated,
          message: 'Hello from step two.',
        }),
      })
      expect(legitimateFinal.status).toBe(303)

      const list = await fetch(`${server.base}/api/forms/submissions`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const listed = (await list.json()) as {
        data: readonly { values: { resume: { filename: string } } }[]
      }
      expect(listed.data).toHaveLength(1)
      expect(listed.data[0]?.values.resume.filename).toBe('resume.png')

      // Now tamper with the signed token before replaying the final step —
      // must be refused, not accepted with a mutated file reference.
      const tamperedAccumulated = JSON.stringify({
        ...parsedAccumulated,
        resume: `${parsedAccumulated['resume']}-tampered`,
      })
      const tamperedFinal = await fetch(`${server.base}/api/forms/contact/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          _gotcha: '',
          _ts: carriedTs,
          _step: '1',
          _accumulated: tamperedAccumulated,
          message: 'Should not be stored.',
        }),
      })
      expect(tamperedFinal.status).toBe(400)

      const listAfter = await fetch(`${server.base}/api/forms/submissions`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(((await listAfter.json()) as { data: readonly unknown[] }).data).toHaveLength(1)
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
