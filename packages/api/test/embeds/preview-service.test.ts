import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createLocalStorage,
  createMemoryRateLimiter,
  createSqliteHandle,
  type DatabaseHandle,
} from '@cogenta/core'
import { createEmbedPreviewStore, embedPreviewHash, ensureEmbedPreviewTable } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createEmbedPreviewService,
  type EmbedPreviewService,
} from '../../src/embeds/preview-service.js'
import { createEmbedRouter } from '../../src/rest/embed-router.js'
import type { AccessContext } from '../../src/types.js'

/** L38: a resolved preview is kept, its thumbnail served by the site, and reused without the network. */

const VIDEO = 'https://www.youtube.com/watch?v=abc123'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9])

let directory: string
let db: DatabaseHandle
let calls: string[]
let answer: () => Response
let clock: Date
let service: EmbedPreviewService

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cogenta-embed-service-'))
  db = await createSqliteHandle({ url: join(directory, 'site.db') })
  await ensureEmbedPreviewTable(db)
  calls = []
  clock = new Date('2026-09-17T10:00:00.000Z')
  answer = () =>
    Response.json({
      title: 'Inspection',
      author_name: 'Norvane',
      width: 560,
      height: 315,
      thumbnail_url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
    })
  service = createEmbedPreviewService({
    store: createEmbedPreviewStore(db),
    storage: createLocalStorage({ path: join(directory, 'media') }),
    now: () => clock,
    fetch: async (url) => {
      calls.push(url)
      if (url.startsWith('https://i.ytimg.com/')) {
        return new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } })
      }
      return answer()
    },
  })
})

afterEach(async () => {
  try {
    await db.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

async function streamBytes(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks)
}

describe('the embed preview service', () => {
  it('resolves once, then answers from the cache', async () => {
    const first = await service.resolve(VIDEO)
    expect(first).toMatchObject({
      provider: 'youtube',
      status: 'ok',
      title: 'Inspection',
      ratio: '16:9',
      thumbnailPath: `/_cogenta/embeds/${embedPreviewHash(VIDEO)}`,
    })
    expect(calls).toHaveLength(2)
    expect(await service.resolve(VIDEO)).toEqual(first)
    expect(calls).toHaveLength(2)
    expect((await service.cached([VIDEO])).get(VIDEO)).toEqual(first)
  })

  it('serves the thumbnail it copied, and nothing for an unknown or malformed hash', async () => {
    await service.resolve(VIDEO)
    const thumbnail = await service.thumbnail(embedPreviewHash(VIDEO))
    expect(thumbnail?.type).toBe('image/jpeg')
    expect((await streamBytes(thumbnail?.body as NodeJS.ReadableStream)).equals(JPEG)).toBe(true)
    expect(await service.thumbnail('0'.repeat(64))).toBeNull()
    expect(await service.thumbnail('../../etc/passwd')).toBeNull()
  })

  it('remembers a failure for a day, then asks again', async () => {
    answer = () => new Response('gone', { status: 404 })
    expect((await service.resolve(VIDEO)).status).toBe('failed')
    expect(await service.resolve(VIDEO)).toMatchObject({ status: 'failed' })
    expect(calls).toHaveLength(1)
    expect(await service.needsResolving(VIDEO)).toBe(false)

    clock = new Date('2026-09-18T11:00:00.000Z')
    expect(await service.needsResolving(VIDEO)).toBe(true)
    answer = () => Response.json({ title: 'De retour' })
    expect((await service.resolve(VIDEO)).title).toBe('De retour')
  })

  it('detects a provider it cannot resolve without calling anything', async () => {
    const post = await service.resolve('https://mastodon.social/@someone/112233')
    expect(post).toMatchObject({ provider: 'mastodon', status: 'unsupported', title: null })
    expect(calls).toHaveLength(0)
    expect(await service.needsResolving('https://example.com/x')).toBe(false)
  })

  it('keeps one row for an address with tracking parameters, and one file for one thumbnail', async () => {
    const pasted = `${VIDEO}&utm_source=newsletter#t=10`
    await service.resolve(pasted)
    expect((await service.cached([VIDEO])).get(VIDEO)?.title).toBe('Inspection')
    // A page keeps the address as it was pasted, and must still find it.
    expect((await service.cached([pasted])).get(pasted)?.title).toBe('Inspection')
    await service.resolve(`${VIDEO}&list=PL1`)
    const files = (await readdir(join(directory, 'media'), { recursive: true })).filter((name) =>
      String(name).endsWith('.jpg'),
    )
    expect(files).toHaveLength(1)
  })

  it('refuses an address that grows past 2048 characters once normalised, before calling anyone', async () => {
    const raw = `https://www.youtube.com/watch?v=abc&q=${'é'.repeat(1000)}`
    expect(raw.length).toBeLessThanOrEqual(2048)
    await expect(service.resolve(raw)).rejects.toMatchObject({ code: 'EMBED_URL_INVALID' })
    expect(await service.needsResolving(raw)).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('refuses an address that is not http or https', async () => {
    await expect(service.resolve('javascript:alert(1)')).rejects.toMatchObject({
      code: 'EMBED_URL_INVALID',
    })
  })
})

describe('POST /api/embeds/resolve', () => {
  it('is for accounts that edit content, and answers the preview', async () => {
    const router = createEmbedRouter({
      service,
      canResolve: (context) => context.actor.roles.includes('editor'),
    })
    const request = { method: 'POST', path: '/api/embeds/resolve', query: {}, body: { url: VIDEO } }

    const anonymous = await router.handle(request)
    expect(anonymous.status).toBe(401)
    expect(calls).toHaveLength(0)

    const editor: AccessContext = { actor: { id: 'u1', roles: ['editor'] } }
    const answered = await router.handle(request, editor)
    expect(answered.status).toBe(200)
    expect((answered.body as { data: { title: string } }).data.title).toBe('Inspection')

    const invalid = await router.handle({ ...request, body: { url: 'ftp://x' } }, editor)
    expect(invalid.status).toBe(400)
  })

  it('refuses a signed-in account that edits nothing, and bounds each account', async () => {
    const router = createEmbedRouter({
      service,
      canResolve: (context) => context.actor.roles.includes('editor'),
      rateLimit: createMemoryRateLimiter(),
      limit: { count: 2, windowMs: 60_000 },
    })
    const request = { method: 'POST', path: '/api/embeds/resolve', query: {}, body: { url: VIDEO } }
    const viewer: AccessContext = { actor: { id: 'v1', roles: ['viewer'] } }
    expect((await router.handle(request, viewer)).status).toBe(403)
    expect(calls).toHaveLength(0)

    const editor: AccessContext = { actor: { id: 'u1', roles: ['editor'] } }
    expect((await router.handle(request, editor)).status).toBe(200)
    expect((await router.handle(request, editor)).status).toBe(200)
    const limited = await router.handle(request, editor)
    expect(limited.status).toBe(429)
    expect((limited.body as { error: { code: string } }).error.code).toBe('EMBED_RATE_LIMITED')
  })
})
