import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Malformed and oversized input against a real listener (pentest 2026-10-26,
 * F-05 and F-06). The router tests cannot see these: the body is read, and the
 * path decoded, before any router is reached.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-hardening-'))
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

const MIB = 1024 * 1024

async function errorOf(response: Response): Promise<{ code: string }> {
  return ((await response.json()) as { error: { code: string } }).error
}

function multipartBody(boundary: string, padding: number): string {
  return [
    `--${boundary}`,
    'Content-Disposition: form-data; name="padding"',
    '',
    'a'.repeat(padding),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

describe('cogenta serve — request size and content type', () => {
  it('refuses a JSON body one byte over the anonymous limit with 413', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      const prefix = '{"padding":"'
      const suffix = '"}'
      const body = `${prefix}${'a'.repeat(MIB + 1 - prefix.length - suffix.length)}${suffix}`
      expect(Buffer.byteLength(body)).toBe(MIB + 1)
      const response = await fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      expect(response.status).toBe(413)
      expect((await errorOf(response)).code).toBe('REQUEST_BODY_TOO_LARGE')
    } finally {
      await server.stop()
    }
  })

  it('refuses a multipart body on the sign-in route with 415 instead of reading it', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=audit' },
        body: multipartBody('audit', MIB),
      })
      expect(response.status).toBe(415)
      expect((await errorOf(response)).code).toBe('REQUEST_UNSUPPORTED_MEDIA_TYPE')
    } finally {
      await server.stop()
    }
  })

  it('does not let a multipart Content-Type raise the anonymous limit on a route that takes no file', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/content/page`, {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=audit' },
        body: multipartBody('audit', 2 * MIB),
      })
      expect(response.status).toBe(413)
      expect((await errorOf(response)).code).toBe('REQUEST_BODY_TOO_LARGE')
    } finally {
      await server.stop()
    }
  })

  it('still accepts a public form file larger than the anonymous JSON limit', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )
      const created = await fetch(`${server.base}/api/forms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'cv',
          label: 'CV',
          fields: [
            { name: 'email', label: 'E-mail', kind: 'email', required: true },
            { name: 'resume', label: 'Resume', kind: 'file', required: true },
          ],
        }),
      })
      expect(created.status).toBe(201)

      const png = new Uint8Array(2 * MIB)
      png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      const form = new FormData()
      form.set('_gotcha', '')
      form.set('_ts', String(Date.now() - 10_000))
      form.set('email', 'visitor@example.com')
      form.set('resume', new Blob([png], { type: 'image/png' }), 'resume.png')

      const submit = await fetch(`${server.base}/api/forms/cv/submit`, {
        method: 'POST',
        redirect: 'manual',
        body: form,
      })
      expect(submit.status).toBe(303)
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — malformed input is a client error, not a server one', () => {
  it('answers 400 QUERY_INVALID to an unterminated JSON sign-in body', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      })
      expect(response.status).toBe(400)
      expect((await errorOf(response)).code).toBe('QUERY_INVALID')
    } finally {
      await server.stop()
    }
  })

  it('answers 400 QUERY_INVALID to a path segment with an incomplete percent-escape', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      for (const path of ['/api/content/%', '/api/auth/%', '/api/content/page/%E0%A4%A']) {
        const response = await fetch(`${server.base}${path}`)
        expect(response.status, path).toBe(400)
        expect((await errorOf(response)).code, path).toBe('QUERY_INVALID')
      }
      // The process keeps serving after each of them.
      expect((await fetch(`${server.base}/api/health`)).status).toBeLessThan(500)
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — control characters in a path', () => {
  it('answers 400 to an API path and 404 to a public one holding a NUL byte, then keeps serving', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      for (const path of ['/api/content/page/%00', '/api/content/%00']) {
        const response = await fetch(`${server.base}${path}`)
        expect(response.status, path).toBe(400)
        expect((await errorOf(response)).code, path).toBe('QUERY_INVALID')
      }
      for (const path of ['/%00', '/blog/%00', '/en/a%00', '/categorie/%00', '/etiquette/a%00b']) {
        expect((await fetch(`${server.base}${path}`)).status, path).toBe(404)
      }
      const image = await fetch(`${server.base}/_image?id=%00&w=1`)
      expect(image.status).toBe(404)
      expect((await fetch(`${server.base}/api/health`)).status).toBeLessThan(500)
    } finally {
      await server.stop()
    }
  })
})
