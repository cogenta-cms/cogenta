import { describe, expect, it } from 'vitest'
import { closestEmbedRatio, detectEmbedProvider, resolveEmbed } from '../../src/embeds/oembed.js'

/**
 * L38: an embed address is resolved through fixed provider endpoints only.
 * Every call goes through a recording fake `fetch` — nothing here touches the
 * network — so what the server would call is asserted, not assumed.
 */

interface Call {
  readonly url: string
  readonly init: RequestInit | undefined
}

function fakeFetch(routes: Record<string, () => Response>): {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  calls: Call[]
} {
  const calls: Call[] = []
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init })
      const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))
      return route === undefined ? new Response('not found', { status: 404 }) : route[1]()
    },
  }
}

const VIDEO = 'https://www.youtube.com/watch?v=abc123'
const OEMBED = {
  title: 'Inspection d’un poste électrique',
  author_name: 'Norvane',
  width: 560,
  height: 315,
  thumbnail_url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
  thumbnail_width: 480,
  thumbnail_height: 360,
}
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

describe('recognising a provider from an address', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc', 'youtube'],
    ['https://youtu.be/abc', 'youtube'],
    ['https://m.youtube.com/watch?v=abc', 'youtube'],
    ['https://vimeo.com/76979871', 'vimeo'],
    ['https://www.dailymotion.com/video/x8abc', 'dailymotion'],
    ['https://dai.ly/x8abc', 'dailymotion'],
    ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'spotify'],
    ['https://soundcloud.com/artist/track', 'soundcloud'],
    ['https://bsky.app/profile/example.com/post/3k', 'bluesky'],
    ['https://mastodon.social/@someone/112233445566', 'mastodon'],
    ['https://notyoutube.com/watch?v=abc', 'other'],
    ['https://example.com/video', 'other'],
  ])('%s is %s', (url, provider) => {
    expect(detectEmbedProvider(new URL(url))).toBe(provider)
  })
})

describe('resolving an address', () => {
  it('asks the provider’s fixed endpoint, refusing redirects, and copies the thumbnail', async () => {
    const fake = fakeFetch({
      'https://www.youtube.com/oembed': () => Response.json(OEMBED),
      'https://i.ytimg.com/': () =>
        new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } }),
    })
    const resolved = await resolveEmbed(VIDEO, 'youtube', { fetch: fake.fetch })
    expect(fake.calls.map((call) => call.url)).toEqual([
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(VIDEO)}`,
      'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
    ])
    expect(fake.calls.every((call) => call.init?.redirect === 'manual')).toBe(true)
    expect(resolved).toMatchObject({
      title: OEMBED.title,
      authorName: 'Norvane',
      width: 560,
      height: 315,
      thumbnail: { type: 'image/jpeg', extension: 'jpg', width: 480, height: 360 },
    })
    expect(resolved?.thumbnail?.bytes.equals(JPEG)).toBe(true)
  })

  it('never fetches a thumbnail from a host its provider does not serve images from', async () => {
    const fake = fakeFetch({
      'https://www.youtube.com/oembed': () =>
        Response.json({ ...OEMBED, thumbnail_url: 'http://169.254.169.254/latest/meta-data' }),
    })
    const resolved = await resolveEmbed(VIDEO, 'youtube', { fetch: fake.fetch })
    expect(fake.calls).toHaveLength(1)
    expect(resolved?.thumbnail).toBeNull()
    expect(resolved?.title).toBe(OEMBED.title)
  })

  it('drops a thumbnail that is not an image, or too large', async () => {
    const html = fakeFetch({
      'https://www.youtube.com/oembed': () => Response.json(OEMBED),
      'https://i.ytimg.com/': () =>
        new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    })
    expect((await resolveEmbed(VIDEO, 'youtube', { fetch: html.fetch }))?.thumbnail).toBeNull()

    const huge = fakeFetch({
      'https://www.youtube.com/oembed': () => Response.json(OEMBED),
      'https://i.ytimg.com/': () =>
        new Response(Buffer.alloc(64), { headers: { 'content-type': 'image/jpeg' } }),
    })
    const resolved = await resolveEmbed(VIDEO, 'youtube', {
      fetch: huge.fetch,
      maxThumbnailBytes: 16,
    })
    expect(resolved?.thumbnail).toBeNull()
  })

  it('answers null, never throws, for a redirect, an error, a timeout or bad JSON', async () => {
    const redirect = fakeFetch({
      'https://www.youtube.com/oembed': () =>
        new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
    })
    expect(await resolveEmbed(VIDEO, 'youtube', { fetch: redirect.fetch })).toBeNull()
    expect(redirect.calls).toHaveLength(1)

    const broken = fakeFetch({ 'https://www.youtube.com/oembed': () => new Response('{nope') })
    expect(await resolveEmbed(VIDEO, 'youtube', { fetch: broken.fetch })).toBeNull()

    const failing = {
      fetch: async (): Promise<Response> => {
        throw new DOMException('timed out', 'TimeoutError')
      },
    }
    expect(await resolveEmbed(VIDEO, 'youtube', failing)).toBeNull()
  })

  it('answers null, never throws, when the body stops arriving before the timeout', async () => {
    const trickle: typeof fetch = (async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"title":'))
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('The operation timed out.', 'TimeoutError')),
          )
        },
      })
      return new Response(body, { status: 200 })
    }) as typeof fetch
    await expect(
      resolveEmbed(VIDEO, 'youtube', { fetch: trickle, timeoutMs: 50 }),
    ).resolves.toBeNull()
  })

  it('never calls anything for a provider without a fixed endpoint', async () => {
    const fake = fakeFetch({})
    expect(
      await resolveEmbed('https://mastodon.social/@a/1', 'mastodon', { fetch: fake.fetch }),
    ).toBeNull()
    expect(await resolveEmbed('https://example.com/', 'other', { fetch: fake.fetch })).toBeNull()
    expect(fake.calls).toHaveLength(0)
  })
})

describe('the proportions of a player', () => {
  it('picks the contract B ratio it is close to, and none when it is close to none', () => {
    expect(closestEmbedRatio(560, 315)).toBe('16:9')
    expect(closestEmbedRatio(640, 480)).toBe('4:3')
    expect(closestEmbedRatio(300, 380)).toBeNull()
    expect(closestEmbedRatio(null, 315)).toBeNull()
  })
})
