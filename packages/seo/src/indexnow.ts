import { CogentaError } from '@cogenta/core'

/**
 * IndexNow — telling Bing, Yandex and Seznam that a URL changed.
 *
 * One POST, no authentication beyond a key file the site serves itself. It is
 * the cheapest indexing win there is, and it is also the one piece of this
 * package that talks to the network, which shapes the design:
 *
 * **A failed ping is not an exception.** Publishing an article must not fail
 * because a third-party endpoint is down, rate-limiting, or slow. So a network
 * error, a timeout and an HTTP 4xx all come back as a result object the caller
 * can log and move on from. `CogentaError` is reserved for what is genuinely
 * the caller's fault and would never succeed on a retry: a malformed key, a URL
 * on the wrong host, an oversized batch.
 *
 * `fetch` is injected so the tests exercise every branch — including the
 * timeout — without a socket. Rule R1 in miniature: the feature degrades to a
 * no-op when the network is absent.
 */

/** IndexNow: a key is 8 to 128 hexadecimal characters. */
const KEY_PATTERN = /^[a-fA-F0-9]{8,128}$/

/** IndexNow accepts at most 10 000 URLs in one submission. */
export const INDEXNOW_MAX_URLS = 10_000

const DEFAULT_ENDPOINT = 'https://api.indexnow.org/indexnow'
const DEFAULT_TIMEOUT_MS = 10_000

export type IndexNowFetch = (
  input: string,
  init: {
    readonly method: string
    readonly headers: Readonly<Record<string, string>>
    readonly body: string
    readonly signal: AbortSignal
  },
) => Promise<{ readonly ok: boolean; readonly status: number }>

export interface IndexNowOptions {
  /** The host the URLs belong to: `example.com`. */
  readonly host: string
  readonly key: string
  /**
   * Where the key file is served, when it is not `/<key>.txt`.
   *
   * Needed by sites that cannot serve a file at the root — the endpoint fetches
   * it to prove the submitter controls the host.
   */
  readonly keyLocation?: string
  readonly urls: readonly string[]
  readonly endpoint?: string
  readonly timeoutMs?: number
  readonly fetch?: IndexNowFetch
}

export type IndexNowResult =
  | { readonly outcome: 'submitted'; readonly status: number; readonly urlCount: number }
  | { readonly outcome: 'skipped'; readonly reason: 'no-urls' | 'no-fetch' }
  | {
      readonly outcome: 'failed'
      readonly reason: 'http' | 'network' | 'timeout'
      readonly status?: number
      readonly message: string
    }

/** The file the site must serve so the endpoint can verify ownership. */
export function indexNowKeyFile(key: string): { readonly path: string; readonly contents: string } {
  assertKey(key)
  return { path: `/${key}.txt`, contents: `${key}\n` }
}

function assertKey(key: string): void {
  if (KEY_PATTERN.test(key)) return
  throw new CogentaError({
    code: 'CONFIG_INVALID',
    message: 'The IndexNow key is not 8 to 128 hexadecimal characters.',
    hint: 'Generate one with crypto.randomUUID().replaceAll("-", ""), then serve it at /<key>.txt.',
    details: { keyLength: key.length },
  })
}

/**
 * Every URL must be on the submitted host — the endpoint rejects the whole
 * batch otherwise, so catching it here turns a silent 422 into an error naming
 * the offending URL.
 */
function assertUrls(host: string, urls: readonly string[]): void {
  if (urls.length > INDEXNOW_MAX_URLS) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `IndexNow accepts ${INDEXNOW_MAX_URLS} URLs per submission, not ${urls.length}.`,
      hint: 'Submit in batches. There is no benefit to submitting a whole site at once.',
      details: { urlCount: urls.length, limit: INDEXNOW_MAX_URLS },
    })
  }

  for (const url of urls) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new CogentaError({
        code: 'CONFIG_INVALID',
        message: `"${url}" is not an absolute URL.`,
        hint: 'IndexNow takes absolute URLs only, protocol included.',
        details: { url },
      })
    }

    if (parsed.host !== host) {
      throw new CogentaError({
        code: 'CONFIG_INVALID',
        message: `"${url}" is not on the submitted host "${host}".`,
        hint: 'One submission covers one host. Group the URLs by host and ping once per group.',
        details: { url, host, urlHost: parsed.host },
      })
    }
  }
}

export async function pingIndexNow(options: IndexNowOptions): Promise<IndexNowResult> {
  assertKey(options.key)
  assertUrls(options.host, options.urls)

  if (options.urls.length === 0) return { outcome: 'skipped', reason: 'no-urls' }

  const send = options.fetch ?? globalFetch()
  // A build target without `fetch` is a supported target, not an error: the
  // site simply does not ping (rule R1).
  if (send === null) return { outcome: 'skipped', reason: 'no-fetch' }

  const body = JSON.stringify({
    host: options.host,
    key: options.key,
    ...(options.keyLocation === undefined ? {} : { keyLocation: options.keyLocation }),
    urlList: options.urls,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const response = await send(options.endpoint ?? DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body,
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        outcome: 'failed',
        reason: 'http',
        status: response.status,
        message: `The IndexNow endpoint answered ${response.status}.`,
      }
    }
    return { outcome: 'submitted', status: response.status, urlCount: options.urls.length }
  } catch (cause) {
    const aborted = controller.signal.aborted
    return {
      outcome: 'failed',
      reason: aborted ? 'timeout' : 'network',
      message: aborted
        ? `The IndexNow endpoint did not answer within ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`
        : messageOf(cause),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The IndexNow request failed.'
}

function globalFetch(): IndexNowFetch | null {
  const candidate = globalThis.fetch
  if (typeof candidate !== 'function') return null
  return (input, init) => candidate(input, init)
}
