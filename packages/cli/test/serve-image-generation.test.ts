import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Generating an image, and keeping one — the two routes `cogenta serve` puts
 * in front of the image-creator agent's work.
 *
 * They are two routes rather than one on purpose: `assist.generate_image`
 * stores nothing by its own contract, because generating is cheap to undo and
 * storing is not. So the first route writes nothing at all, and the second
 * keeps exactly the one a human picked. The test that matters most here is
 * the one asserting the media library is still empty after a generation.
 *
 * The vendor is a real HTTP server answering on the real OpenAI image wire
 * shape rather than an injected client: that way `resolveImageClient`, the
 * adapter, and the route are all genuinely exercised — a client handed in by
 * the test would prove only the last of the three.
 */

/** A real 1×1 PNG, base64 — small, but genuinely decodable bytes. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

interface VendorCall {
  readonly authorization: string | undefined
  readonly body: Record<string, unknown>
}

interface FakeVendor {
  readonly url: string
  readonly calls: VendorCall[]
  stop(): Promise<void>
}

/** Answers exactly what `parseOpenAiImageResponse` reads, and records what it was asked. */
async function startFakeVendor(): Promise<FakeVendor> {
  const calls: VendorCall[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      calls.push({ authorization: req.headers.authorization, body })
      const n = typeof body['n'] === 'number' ? body['n'] : 1
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          data: Array.from({ length: n }, (_unused, index) => ({
            b64_json: PNG_BASE64,
            revised_prompt: `revised ${index}`,
          })),
        }),
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return {
    url: `http://127.0.0.1:${address.port}/v1/images/generations`,
    calls,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

async function project(vendorUrl?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-image-generation-serve-'))
  const imageGeneration =
    vendorUrl === undefined
      ? ''
      : `  imageGeneration: { provider: 'openai', model: 'gpt-image-1', baseUrl: ${JSON.stringify(vendorUrl)} },\n`
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
${imageGeneration}}
`,
    'utf8',
  )
  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')
  return root
}

const activeServers: AbortController[] = []
const activeVendors: FakeVendor[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  await Promise.all(activeVendors.splice(0).map((vendor) => vendor.stop()))
})

async function tokenFor(
  root: string,
  base: string,
  email: string,
  roles: readonly string[],
): Promise<string> {
  await createUser(root, email, 'correct horse battery staple', roles)
  return loginWithMfaSetup(base, email, 'correct horse battery staple')
}

interface MediaAssetRow {
  readonly id: string
  readonly alt: string | null
  readonly provenance: string
  readonly provenanceDetail: Record<string, unknown> | null
}

async function mediaAssets(base: string, token: string): Promise<readonly MediaAssetRow[]> {
  const response = await fetch(`${base}/api/media`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const body = (await response.json()) as { data: readonly MediaAssetRow[] }
  return body.data
}

describe('cogenta serve — generating and keeping images', () => {
  it('offers the feature as absent rather than broken when no image model is configured', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await tokenFor(root, server.base, 'admin@example.com', ['admin'])

      const response = await fetch(`${server.base}/api/media/generate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'a baker sliding baguettes into a wood oven' }),
      })

      expect(response.status).toBe(501)
      const body = (await response.json()) as { error: { code: string; hint?: string } }
      expect(body.error.code).toBe('ASSIST_NO_IMAGE_PROVIDER')
      // R2: the refusal says where to go, and nothing else in the media
      // library is affected by the absence.
      expect(body.error.hint).toContain('Fournisseurs')
      expect(await mediaAssets(server.base, token)).toEqual([])
    } finally {
      await server.stop()
    }
  })

  it('refuses an editor, who may upload but may not spend the site money', async () => {
    const vendor = await startFakeVendor()
    activeVendors.push(vendor)
    const root = await project(vendor.url)
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_IMAGE_API_KEY: 'test-image-key' },
    })
    try {
      const token = await tokenFor(root, server.base, 'editor@example.com', ['editor'])

      const response = await fetch(`${server.base}/api/media/generate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'a hero photograph' }),
      })

      expect(response.status).toBe(403)
      // The vendor was never called: the role is checked before the money is.
      expect(vendor.calls).toEqual([])
    } finally {
      await server.stop()
    }
  })

  it('returns candidates and writes nothing at all', async () => {
    const vendor = await startFakeVendor()
    activeVendors.push(vendor)
    const root = await project(vendor.url)
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_IMAGE_API_KEY: 'test-image-key' },
    })
    try {
      const token = await tokenFor(root, server.base, 'admin@example.com', ['admin'])

      const response = await fetch(`${server.base}/api/media/generate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'a baker sliding baguettes into a wood oven',
          size: 'landscape',
        }),
      })

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: {
          applied: boolean
          model: string
          images: readonly { dataUrl: string; revisedPrompt?: string }[]
        }
      }
      // Two by default: a choice costs almost nothing next to a regeneration.
      expect(body.data.images).toHaveLength(2)
      expect(body.data.applied).toBe(false)
      expect(body.data.model).toBe('gpt-image-1')
      expect(body.data.images[0]?.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
      expect(body.data.images[0]?.revisedPrompt).toBe('revised 0')

      // The key reached the vendor at the runtime boundary, never the prompt (R7).
      expect(vendor.calls[0]?.authorization).toBe('Bearer test-image-key')
      expect(vendor.calls[0]?.body['size']).toBe('1536x640')

      // And the whole point of two routes: nothing was stored.
      expect(await mediaAssets(server.base, token)).toEqual([])
    } finally {
      await server.stop()
    }
  })

  it('keeps the one a human picked, recorded as generated', async () => {
    const vendor = await startFakeVendor()
    activeVendors.push(vendor)
    const root = await project(vendor.url)
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_IMAGE_API_KEY: 'test-image-key' },
    })
    try {
      const token = await tokenFor(root, server.base, 'admin@example.com', ['admin'])
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

      const generated = await fetch(`${server.base}/api/media/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: 'a baker sliding baguettes into a wood oven', count: 1 }),
      })
      const candidates = (await generated.json()) as {
        data: { images: readonly { dataUrl: string }[] }
      }
      const chosen = candidates.data.images[0]?.dataUrl ?? ''

      const kept = await fetch(`${server.base}/api/media/generate/keep`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dataUrl: chosen,
          filename: 'Hero — bakery at dawn!',
          alt: 'A baker sliding a tray of baguettes into a wood oven',
        }),
      })

      expect(kept.status).toBe(201)
      const assets = await mediaAssets(server.base, token)
      expect(assets).toHaveLength(1)
      expect(assets[0]?.alt).toBe('A baker sliding a tray of baguettes into a wood oven')
      // The one field of contract A the European AI framework makes
      // non-optional: a reader is entitled to know this was not a photograph.
      expect(assets[0]?.provenance).toBe('generated')
      expect(assets[0]?.provenanceDetail?.['model']).toBe('gpt-image-1')
    } finally {
      await server.stop()
    }
  })

  it('refuses to keep an image with no alt text', async () => {
    const vendor = await startFakeVendor()
    activeVendors.push(vendor)
    const root = await project(vendor.url)
    const server = await startServer(root, {
      registry: activeServers,
      env: { COGENTA_IMAGE_API_KEY: 'test-image-key' },
    })
    try {
      const token = await tokenFor(root, server.base, 'admin@example.com', ['admin'])

      const response = await fetch(`${server.base}/api/media/generate/keep`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          dataUrl: `data:image/png;base64,${PNG_BASE64}`,
          filename: 'hero',
          alt: '   ',
        }),
      })

      expect(response.status).toBe(400)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('CONTENT_INVALID')
    } finally {
      await server.stop()
    }
  })
})
