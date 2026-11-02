import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import { CogentaError } from '../errors/index.js'

/**
 * Guards against an outbound request becoming one an attacker chose the
 * destination of.
 *
 * A WXR, an RSS feed, a link in a page or a URL an agent was handed is
 * untrusted input (rule R8) that the server turns into an outbound request.
 * Without this check, whoever controls that text can make the server fetch
 * `http://169.254.169.254/latest/meta-data/` (cloud instance metadata) or
 * `http://localhost:5432` (a database port) — and, when the response is
 * stored or reported, read it back or at least probe the internal network.
 *
 * Two things make the check hold (pentest 2026-11-01, C-04):
 *
 * 1. **Addresses are classified as numbers, not text.** An IPv4 or IPv6
 *    address is parsed to its bytes and compared against explicit CIDR
 *    ranges, so `fe90::1`, `0:0:0:0:0:0:0:1` or `::ffff:7f00:1` cannot slip
 *    past a prefix test written for one spelling.
 * 2. **The address that was checked is the address that is connected to.**
 *    {@link resolvePublicTarget} resolves once and returns the validated
 *    address; {@link createPinnedFetch} then connects to exactly that address
 *    (keeping the original host name for `Host`, SNI and certificate
 *    verification). Resolving again for the request — what `fetch` does —
 *    would let a DNS answer change between the check and the connection.
 */

interface Cidr {
  readonly base: bigint
  readonly bits: number
  readonly total: number
}

function cidr4(text: string): Cidr {
  const [address = '', length = '32'] = text.split('/')
  return { base: BigInt(ipv4ToNumber(address)), bits: Number(length), total: 32 }
}

function cidr6(text: string): Cidr {
  const [address = '', length = '128'] = text.split('/')
  return { base: ipv6ToBigInt(address) ?? 0n, bits: Number(length), total: 128 }
}

function inside(value: bigint, range: Cidr): boolean {
  const shift = BigInt(range.total - range.bits)
  return value >> shift === range.base >> shift
}

function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map(Number)
  return (
    (((parts[0] ?? 0) << 24) |
      ((parts[1] ?? 0) << 16) |
      ((parts[2] ?? 0) << 8) |
      (parts[3] ?? 0)) >>>
    0
  )
}

/** Not globally routable: the ranges an outbound request must never reach. */
const BLOCKED_IPV4: readonly Cidr[] = [
  '0.0.0.0/8', // "this network"
  '10.0.0.0/8',
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local, cloud instance metadata
  '172.16.0.0/12',
  '192.0.0.0/24', // IETF protocol assignments
  '192.0.2.0/24', // documentation
  '192.88.99.0/24', // 6to4 relay anycast (deprecated)
  '192.168.0.0/16',
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // documentation
  '203.0.113.0/24', // documentation
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved, and the limited broadcast 255.255.255.255
].map(cidr4)

function isBlockedIpv4Number(value: number): boolean {
  const big = BigInt(value)
  return BLOCKED_IPV4.some((range) => inside(big, range))
}

/**
 * IPv6 is allowed only inside global unicast (`2000::/3`) minus what that
 * block reserves; everything outside it — loopback, unspecified, unique-local,
 * link-local, site-local, multicast, discard — is refused by not being in it.
 * Two transition formats carry an IPv4 address and are judged by it.
 */
const GLOBAL_UNICAST_V6 = cidr6('2000::/3')
const BLOCKED_IPV6: readonly Cidr[] = [
  '2001::/23', // IETF assignments: Teredo, benchmarking, ORCHID…
  '2001:db8::/32', // documentation
  '3fff::/20', // documentation
].map(cidr6)
const SIX_TO_FOUR = cidr6('2002::/16')
const NAT64 = cidr6('64:ff9b::/96')
const IPV4_MAPPED = cidr6('::ffff:0:0/96')

/** The 128-bit value of an IPv6 literal, or `null` when it is not one. */
function ipv6ToBigInt(text: string): bigint | null {
  let address = text.toLowerCase()
  const zone = address.indexOf('%')
  if (zone >= 0) address = address.slice(0, zone)
  if (isIP(address) !== 6) return null

  // A dotted-quad tail (`::ffff:127.0.0.1`) is two groups.
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/u.exec(address)
  if (dotted !== null) {
    const tail = ipv4ToNumber(dotted[2] ?? '')
    address = `${dotted[1] ?? ''}${(tail >>> 16).toString(16)}:${(tail & 0xffff).toString(16)}`
  }

  const [head = '', rest] = address.split('::')
  const left = head === '' ? [] : head.split(':')
  const right = rest === undefined || rest === '' ? [] : rest.split(':')
  const missing = 8 - left.length - right.length
  const groups = rest === undefined ? left : [...left, ...Array(missing).fill('0'), ...right]
  if (groups.length !== 8) return null

  let value = 0n
  for (const group of groups) value = (value << 16n) | BigInt(Number.parseInt(group, 16))
  return value
}

function isBlockedIpv6(value: bigint): boolean {
  if (inside(value, IPV4_MAPPED) || inside(value, NAT64)) {
    return isBlockedIpv4Number(Number(value & 0xffffffffn))
  }
  if (inside(value, SIX_TO_FOUR)) {
    // 2002:AABB:CCDD::/48 carries the IPv4 address AA.BB.CC.DD.
    return isBlockedIpv4Number(Number((value >> 80n) & 0xffffffffn))
  }
  if (!inside(value, GLOBAL_UNICAST_V6)) return true
  return BLOCKED_IPV6.some((range) => inside(value, range))
}

/** `true` for any address an outbound request must not reach. Unparseable input is refused. */
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip
  const kind = isIP(bare)
  if (kind === 4) return isBlockedIpv4Number(ipv4ToNumber(bare))
  if (kind === 6) {
    const value = ipv6ToBigInt(bare)
    return value === null ? true : isBlockedIpv6(value)
  }
  return true // not a recognisable literal — refuse rather than guess
}

/**
 * `cause` tells a caller what kind of refusal this was: `private` is an
 * address (or `localhost`) the server must not reach, which a link checker
 * reports differently from `unresolved` (the name leads nowhere) or `invalid`
 * (not an http(s) URL at all).
 */
export type UnsafeCause = 'private' | 'unresolved' | 'invalid'

function unsafeUrl(url: string, reason: string, cause: UnsafeCause): CogentaError {
  return new CogentaError({
    code: 'HTTP_TARGET_UNSAFE',
    message: `"${url}" cannot be fetched: ${reason}.`,
    hint: 'Only public http(s) addresses are reached. Use a publicly reachable URL.',
    details: { url, reason, cause },
  })
}

/** A URL whose host was resolved and judged public, with the address it was judged on. */
export interface PublicTarget {
  readonly url: URL
  /** The validated address — the only one a connection may use. */
  readonly address: string
  readonly family: 4 | 6
}

type LookupFn = (
  hostname: string,
  options: { all: true },
) => Promise<readonly { readonly address: string; readonly family?: number }[]>

/**
 * Resolves the URL's host **once** and returns the address it is allowed to be
 * reached at, or throws if the URL, or any address it resolves to, is
 * loopback, link-local or otherwise private. Checked on the resolved IP, not
 * the host name, so `http://a.b.c` that resolves to `127.0.0.1` is refused
 * just the same.
 */
export async function resolvePublicTarget(
  url: string,
  options: { readonly lookupImpl?: typeof lookup } = {},
): Promise<PublicTarget> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw unsafeUrl(url, 'not a valid URL', 'invalid')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw unsafeUrl(url, `protocol "${parsed.protocol}" is not allowed`, 'invalid')
  }

  // `URL.hostname` keeps the brackets of an IPv6 literal.
  const hostname =
    parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw unsafeUrl(url, 'localhost is not a public address', 'private')
  }

  const literal = isIP(hostname)
  if (literal !== 0) {
    if (isPrivateAddress(hostname)) throw unsafeUrl(url, 'resolves to a private address', 'private')
    return { url: parsed, address: hostname, family: literal === 6 ? 6 : 4 }
  }

  const doLookup = (options.lookupImpl ?? lookup) as unknown as LookupFn
  let addresses: readonly { readonly address: string; readonly family?: number }[]
  try {
    const result: unknown = await doLookup(hostname, { all: true })
    addresses = (Array.isArray(result) ? result : [result]) as typeof addresses
  } catch {
    throw unsafeUrl(url, 'the host name could not be resolved', 'unresolved')
  }

  if (addresses.length === 0)
    throw unsafeUrl(url, 'the host name resolved to nothing', 'unresolved')
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw unsafeUrl(url, 'resolves to a private address', 'private')
  }
  const first = addresses[0]
  if (first === undefined) throw unsafeUrl(url, 'the host name resolved to nothing', 'unresolved')
  return { url: parsed, address: first.address, family: isIP(first.address) === 6 ? 6 : 4 }
}

/** {@link resolvePublicTarget} for callers that only need the verdict. */
export async function assertPublicUrl(
  url: string,
  options: { readonly lookupImpl?: typeof lookup } = {},
): Promise<void> {
  await resolvePublicTarget(url, options)
}

export interface PinnedRequestInit {
  readonly signal?: AbortSignal
  readonly method?: 'GET' | 'HEAD'
}

/** What fetches a {@link PublicTarget}. Injected in tests; {@link createPinnedFetch} in production. */
export type PinnedFetch = (target: PublicTarget, init: PinnedRequestInit) => Promise<Response>

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

/**
 * A fetch that connects to the address in the {@link PublicTarget} and to no
 * other, whatever DNS says now.
 *
 * Built on `node:http(s)` with a `lookup` that answers only the validated
 * address, so no second resolution can happen. The request keeps the URL's
 * host name — `Host`, TLS SNI and certificate verification all use it — so
 * pinning the address does not weaken HTTPS. Redirects are not followed:
 * the caller re-validates and re-pins every hop.
 */
export function createPinnedFetch(): PinnedFetch {
  return (target, init) =>
    new Promise<Response>((resolve, reject) => {
      const url = target.url
      const secure = url.protocol === 'https:'
      const hostname =
        url.hostname.startsWith('[') && url.hostname.endsWith(']')
          ? url.hostname.slice(1, -1)
          : url.hostname
      const send = secure ? httpsRequest : httpRequest

      const req = send(
        {
          protocol: url.protocol,
          hostname,
          ...(url.port === '' ? {} : { port: Number(url.port) }),
          path: `${url.pathname}${url.search}`,
          method: init.method ?? 'GET',
          headers: {
            host: url.host,
            accept: '*/*',
            'accept-encoding': 'identity',
            'user-agent': 'cogenta-import',
          },
          lookup: (_name, options, callback) => {
            const entry = { address: target.address, family: target.family }
            if (options.all === true) callback(null, [entry])
            else callback(null, entry.address, entry.family)
          },
          ...(init.signal === undefined ? {} : { signal: init.signal }),
        },
        (res) => {
          const headers = new Headers()
          for (const [name, value] of Object.entries(res.headers)) {
            if (Array.isArray(value)) for (const item of value) headers.append(name, item)
            else if (value !== undefined) headers.set(name, value)
          }
          const status = res.statusCode ?? 502
          if (NULL_BODY_STATUSES.has(status) || init.method === 'HEAD') {
            res.resume()
            resolve(new Response(null, { status, headers }))
            return
          }
          resolve(
            new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status, headers }),
          )
        },
      )
      req.on('error', reject)
      req.end()
    })
}

export interface FetchPublicOptions {
  readonly signal?: AbortSignal
  readonly method?: 'GET' | 'HEAD'
  /** Injected for tests — real `dns.lookup` by default. */
  readonly lookupImpl?: typeof lookup
  /** Injected for tests — the address-pinned transport by default. */
  readonly pinnedFetch?: PinnedFetch
}

/**
 * One hop: resolve and judge the host, then request the validated address.
 * Redirects are never followed here — the caller reads `Location` and calls
 * this again, so every hop is judged on its own.
 */
export async function fetchPublicOnce(
  url: string,
  options: FetchPublicOptions = {},
): Promise<Response> {
  const target = await resolvePublicTarget(url, {
    ...(options.lookupImpl === undefined ? {} : { lookupImpl: options.lookupImpl }),
  })
  const send = options.pinnedFetch ?? createPinnedFetch()
  return send(target, {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.method === undefined ? {} : { method: options.method }),
  })
}
