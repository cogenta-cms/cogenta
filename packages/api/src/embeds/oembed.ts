/**
 * Resolving an embed address into a preview (L38): which provider it is, and
 * what that provider's oEmbed endpoint says about it.
 *
 * **The server never calls an address a user supplied.** A pasted address is
 * only ever a query parameter of one of the fixed endpoints below; a provider
 * without a fixed endpoint (Mastodon — one instance per domain — and "other")
 * is detected but not resolved. Redirects are refused, so a fixed endpoint
 * cannot be turned into a hop somewhere else, and a thumbnail is fetched only
 * from the image hosts its own provider serves them from, as an image, under
 * a size cap. Everything reads through an injected `fetch`, so the tests
 * never touch the network.
 */

export const EMBED_PROVIDERS = [
  'youtube',
  'vimeo',
  'dailymotion',
  'spotify',
  'soundcloud',
  'bluesky',
  'mastodon',
  'other',
] as const

export type EmbedProvider = (typeof EMBED_PROVIDERS)[number]

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/** The provider an address belongs to, from its host alone. */
export function detectEmbedProvider(url: URL): EmbedProvider {
  const host = url.hostname.toLowerCase()
  if (hostIs(host, 'youtube.com') || host === 'youtu.be' || hostIs(host, 'youtube-nocookie.com')) {
    return 'youtube'
  }
  if (hostIs(host, 'vimeo.com')) return 'vimeo'
  if (hostIs(host, 'dailymotion.com') || host === 'dai.ly') return 'dailymotion'
  if (host === 'open.spotify.com' || host === 'spotify.link') return 'spotify'
  if (hostIs(host, 'soundcloud.com')) return 'soundcloud'
  if (host === 'bsky.app') return 'bluesky'
  // A Mastodon post lives on any instance; its path is the only tell.
  if (/^\/@[\w.-]+\/\d+$/u.test(url.pathname)) return 'mastodon'
  return 'other'
}

const ENDPOINTS: Partial<Record<EmbedProvider, (url: string) => string>> = {
  youtube: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  vimeo: (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  dailymotion: (url) =>
    `https://www.dailymotion.com/services/oembed?format=json&url=${encodeURIComponent(url)}`,
  spotify: (url) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
  soundcloud: (url) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  bluesky: (url) => `https://embed.bsky.app/oembed?format=json&url=${encodeURIComponent(url)}`,
}

const THUMBNAIL_HOSTS: Partial<Record<EmbedProvider, readonly string[]>> = {
  youtube: ['ytimg.com', 'img.youtube.com'],
  vimeo: ['vimeocdn.com'],
  dailymotion: ['dmcdn.net'],
  spotify: ['scdn.co', 'spotifycdn.com'],
  soundcloud: ['sndcdn.com'],
  bluesky: ['cdn.bsky.app'],
}

const THUMBNAIL_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Whether this provider has a fixed oEmbed endpoint the server may call. */
export function isResolvableProvider(provider: EmbedProvider): boolean {
  return ENDPOINTS[provider] !== undefined
}

export interface ResolvedThumbnail {
  readonly bytes: Buffer
  readonly type: string
  readonly extension: string
  readonly width: number | null
  readonly height: number | null
}

export interface ResolvedEmbed {
  readonly title: string | null
  readonly authorName: string | null
  readonly width: number | null
  readonly height: number | null
  readonly thumbnail: ResolvedThumbnail | null
}

export interface ResolveEmbedOptions {
  readonly fetch: Fetch
  /** Per request. */
  readonly timeoutMs?: number
  readonly maxJsonBytes?: number
  readonly maxThumbnailBytes?: number
}

/** Reads a body up to `max` bytes, or `null` past it. */
async function readCapped(response: Response, max: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > max) return null
  if (response.body === null) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed.slice(0, max)
}

function dimension(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isInteger(parsed) && parsed > 0 && parsed < 20_000
    ? parsed
    : null
}

async function get(fetcher: Fetch, url: string, timeoutMs: number): Promise<Response | null> {
  try {
    const response = await fetcher(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json, image/*' },
    })
    return response.status === 200 ? response : null
  } catch {
    return null
  }
}

async function thumbnailFrom(
  provider: EmbedProvider,
  raw: unknown,
  options: Required<ResolveEmbedOptions>,
  width: unknown,
  height: unknown,
): Promise<ResolvedThumbnail | null> {
  if (typeof raw !== 'string') return null
  const url = URL.parse(raw)
  const hosts = THUMBNAIL_HOSTS[provider] ?? []
  if (
    url === null ||
    url.protocol !== 'https:' ||
    !hosts.some((host) => hostIs(url.hostname.toLowerCase(), host))
  ) {
    return null
  }
  const response = await get(options.fetch, url.toString(), options.timeoutMs)
  if (response === null) return null
  const type = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
  const extension = type === undefined ? undefined : THUMBNAIL_TYPES[type]
  if (type === undefined || extension === undefined) return null
  const bytes = await readCapped(response, options.maxThumbnailBytes)
  if (bytes === null || bytes.length === 0) return null
  return { bytes, type, extension, width: dimension(width), height: dimension(height) }
}

/**
 * The provider's own description of `url`, or `null` when the provider has no
 * fixed endpoint, answers anything but a well-formed 200, or times out. Never
 * throws: a preview is a convenience, never a reason for a save to fail.
 */
export async function resolveEmbed(
  url: string,
  provider: EmbedProvider,
  options: ResolveEmbedOptions,
): Promise<ResolvedEmbed | null> {
  try {
    return await resolveOrThrow(url, provider, options)
  } catch {
    // A body cut short by the timeout, a connection reset mid-read: a failure
    // like any other, recorded by the caller rather than thrown past it.
    return null
  }
}

async function resolveOrThrow(
  url: string,
  provider: EmbedProvider,
  options: ResolveEmbedOptions,
): Promise<ResolvedEmbed | null> {
  const endpoint = ENDPOINTS[provider]
  if (endpoint === undefined) return null
  const resolved: Required<ResolveEmbedOptions> = {
    fetch: options.fetch,
    timeoutMs: options.timeoutMs ?? 5000,
    maxJsonBytes: options.maxJsonBytes ?? 256_000,
    maxThumbnailBytes: options.maxThumbnailBytes ?? 2_000_000,
  }
  const response = await get(resolved.fetch, endpoint(url), resolved.timeoutMs)
  if (response === null) return null
  const body = await readCapped(response, resolved.maxJsonBytes)
  if (body === null) return null
  let data: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    data = parsed as Record<string, unknown>
  } catch {
    return null
  }
  return {
    title: text(data['title'], 500),
    authorName: text(data['author_name'], 200),
    width: dimension(data['width']),
    height: dimension(data['height']),
    thumbnail: await thumbnailFrom(
      provider,
      data['thumbnail_url'],
      resolved,
      data['thumbnail_width'],
      data['thumbnail_height'],
    ),
  }
}

const RATIOS: readonly (readonly [string, number])[] = [
  ['1:1', 1],
  ['4:3', 4 / 3],
  ['3:2', 3 / 2],
  ['16:9', 16 / 9],
  ['21:9', 21 / 9],
]

/** Contract B's `ratio` closest to a player's proportions, or `null` when none is close. */
export function closestEmbedRatio(width: number | null, height: number | null): string | null {
  if (width === null || height === null) return null
  const actual = width / height
  let best: readonly [string, number] | undefined
  for (const candidate of RATIOS) {
    if (best === undefined || Math.abs(candidate[1] - actual) < Math.abs(best[1] - actual)) {
      best = candidate
    }
  }
  return best !== undefined && Math.abs(best[1] - actual) / best[1] < 0.06 ? best[0] : null
}
