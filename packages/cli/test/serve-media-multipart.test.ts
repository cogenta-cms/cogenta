import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makePng } from './helpers/png.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Fiche 05 task 1, end to end (audit `05-mediatheque.md` §6 T01): the admin
 * now uploads via real `multipart/form-data` (`uploadMediaMultipart`,
 * `XMLHttpRequest`) rather than JSON+base64 — `media-router.ts` has routed
 * multipart to `normaliseMultipartUpload` since fiche 11 task 1, but nothing
 * in this repository's test suite had ever actually sent it a real
 * multipart request for a *new* upload before this fiche (only `/replace`
 * was exercised that way — see `serve-images.test.ts`). This proves the
 * transport the admin genuinely uses now, against a real server, a real
 * image driver and a real SQLite database — not the JSON path every other
 * upload test in this repository still (legitimately) covers for headless
 * clients.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-media-multipart-'))
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

async function signIn(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

interface Asset {
  readonly id: string
  readonly kind: string
  readonly mimeType: string
  readonly width: number | null
  readonly height: number | null
  readonly alt: string
  readonly decorative: boolean
}

describe('cogenta serve — multipart upload (fiche 05 task 1)', () => {
  it('stores a multi-megabyte file sent as real multipart/form-data, with its real dimensions', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      // 1800×1200 gets well past half a megabyte once encoded — this is
      // the same "several MB" file size the audit names, not a token byte
      // or two that a JSON-with-base64 payload could shrug off too.
      const bytes = makePng(1800, 1200)
      expect(bytes.byteLength).toBeGreaterThan(512 * 1024)

      const form = new FormData()
      form.append('file', new Blob([bytes], { type: 'image/png' }), 'large.png')
      // Sent explicitly, matching what `uploadMediaMultipart` (`media-client.ts`) does.
      form.append('kind', 'image')
      form.append('alt', 'A large gradient')

      const response = await fetch(`${server.base}/api/media`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      })
      expect(response.status).toBe(201)
      const asset = ((await response.json()) as { data: Asset }).data

      expect(asset.kind).toBe('image')
      expect(asset.mimeType).toBe('image/png')
      expect(asset.width).toBe(1800)
      expect(asset.height).toBe(1200)
      expect(asset.alt).toBe('A large gradient')
    } finally {
      await server.stop()
    }
  }, 60_000)

  // The exact security rule L10 already proved for the JSON path
  // (`serve-images.test.ts`'s "never serves an image with a content type
  // that could execute") must hold on the multipart path too — a disguised
  // upload is not a JSON-only concern.
  it("stores the type the bytes actually are, never the multipart part's declared type", async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const bytes = makePng(400, 300)

      const form = new FormData()
      // A real PNG, declared as HTML in the multipart part itself — `kind`
      // is what `uploadMediaMultipart` actually sends (mirroring the JSON
      // path), which is what makes `verifyRealType` re-sniff the bytes
      // instead of trusting the disguised declared type.
      form.append('file', new Blob([bytes], { type: 'text/html' }), 'disguised.png')
      form.append('kind', 'image')
      form.append('decorative', 'true')
      form.append('decorativeJustification', 'A background pattern.')

      const response = await fetch(`${server.base}/api/media`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      })
      expect(response.status).toBe(201)
      const asset = ((await response.json()) as { data: Asset }).data
      expect(asset.mimeType).toBe('image/png')

      const served = await fetch(`${server.base}/_image?id=${asset.id}`)
      expect(served.status).toBe(200)
      expect(served.headers.get('content-type')).not.toBe('text/html')
      await served.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses a non-decorative multipart upload with no alt text, the same rule the JSON path enforces', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const form = new FormData()
      form.append('file', new Blob([makePng(100, 100)], { type: 'image/png' }), 'no-alt.png')

      const response = await fetch(`${server.base}/api/media`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      })
      expect(response.status).toBe(400)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('MEDIA_INVALID')
    } finally {
      await server.stop()
    }
  }, 60_000)
})
