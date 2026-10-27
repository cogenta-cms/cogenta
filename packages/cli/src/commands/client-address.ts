import type { IncomingMessage } from 'node:http'
import { BlockList, isIP } from 'node:net'

/**
 * Who is calling, and over what protocol — decided in one place.
 *
 * `cogenta serve` is usually not the first hop. Behind an ingress and a CDN
 * every socket belongs to the proxy, so an address taken from the socket makes
 * a per-address rate limit one global limit, and the comment moderation rule
 * "this address already has an approved comment" meaningless. The proxy does
 * tell us who the caller was, in a header — but a header is typed by whoever
 * sends the request, and with no proxy in front, honouring one lets a visitor
 * pick the address the limiter and the audit trail see.
 *
 * So this is an explicit, off-by-default setting (`security.trustProxy`), and
 * each mode trusts only what an attacker cannot forge from outside:
 *
 * - a header name (`cf-connecting-ip`, or the alias `cloudflare`): the value
 *   of that one header, which the operator knows a proxy overwrites;
 * - a number N: the Nth entry from the *right* of `x-forwarded-for`. Each
 *   trusted proxy appends the address it saw connect, so the right-hand end
 *   is written by infrastructure the operator runs; the left-hand end is
 *   whatever the client claimed.
 *
 * Whatever does not parse as an address falls back to the socket's, never to
 * a guess. Left to itself this cannot tell whether the socket really is the
 * proxy, so `security.trustProxyFrom` names the addresses or CIDR blocks the
 * proxies connect from: a request from anywhere else reached the server
 * directly and its forwarded headers are ignored. Without it, keeping the pod
 * reachable only through the proxy (a network policy, a private network) is
 * the operator's half of the bargain, written in `docker/README.md`.
 */

export type TrustProxySetting = false | number | string

export type TrustRule =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'header'
      readonly header: string
      readonly from?: ProxyAllowList
    }
  | {
      readonly kind: 'hops'
      readonly count: number
      readonly from?: ProxyAllowList
    }

/** The sockets allowed to speak for a proxy. */
export interface ProxyAllowList {
  readonly sources: readonly string[]
  contains(address: string): boolean
}

/** Cloudflare's own client-address header. */
const CLOUDFLARE_HEADER = 'cf-connecting-ip'

/**
 * Builds the membership test for `security.trustProxyFrom`. The entries were
 * validated as addresses or CIDR blocks by the configuration; `BlockList`
 * compares an IPv4-mapped IPv6 socket address (`::ffff:10.0.0.7`, what a
 * dual-stack listener reports) against IPv4 entries as the IPv4 address it is.
 */
export function proxyAllowList(sources: readonly string[]): ProxyAllowList {
  const list = new BlockList()
  for (const source of sources) {
    const slash = source.indexOf('/')
    const address = slash === -1 ? source : source.slice(0, slash)
    const family = isIP(address) === 6 ? 'ipv6' : 'ipv4'
    if (slash === -1) list.addAddress(address, family)
    else list.addSubnet(address, Number(source.slice(slash + 1)), family)
  }
  return {
    sources,
    contains(address) {
      // A zone suffix (`fe80::1%eth0`) is not part of the address.
      const bare = address.split('%', 1)[0] ?? address
      const family = isIP(bare)
      if (family === 0) return false
      return list.check(bare, family === 6 ? 'ipv6' : 'ipv4')
    },
  }
}

const allowLists = new Map<string, ProxyAllowList>()

export function trustRuleFor(
  setting: TrustProxySetting,
  trustedSources: readonly string[] = [],
): TrustRule {
  if (setting === false) return { kind: 'none' }
  // The rule is rebuilt per request, the block list is not.
  const key = trustedSources.join(',')
  let from = allowLists.get(key)
  if (from === undefined && trustedSources.length > 0) {
    from = proxyAllowList(trustedSources)
    allowLists.set(key, from)
  }
  const sources = from === undefined ? {} : { from }
  if (typeof setting === 'number') return { kind: 'hops', count: setting, ...sources }
  const header = setting.toLowerCase()
  return {
    kind: 'header',
    header: header === 'cloudflare' ? CLOUDFLARE_HEADER : header,
    ...sources,
  }
}

/** True when the socket may speak for a proxy: always, unless `trustProxyFrom` narrows it. */
function comesFromTrustedProxy(req: Pick<IncomingMessage, 'socket'>, rule: TrustRule): boolean {
  if (rule.kind === 'none' || rule.from === undefined) return true
  const address = req.socket.remoteAddress
  return address !== undefined && rule.from.contains(address)
}

function headerOf(req: Pick<IncomingMessage, 'headers'>, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value.join(', ') : value
}

/**
 * One address out of a header entry, or `undefined` when it is not an IP.
 * Accepts the shapes proxies really emit: `1.2.3.4`, `1.2.3.4:5678`,
 * `[::1]`, `[::1]:443`, bare IPv6.
 */
function parseAddress(raw: string): string | undefined {
  let candidate = raw.trim()
  if (candidate === '') return undefined
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/u.exec(candidate)
  if (bracketed?.[1] !== undefined) {
    candidate = bracketed[1]
  } else if (/^[^:]+:\d{1,5}$/u.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(':'))
  }
  return isIP(candidate) === 0 ? undefined : candidate
}

function socketAddress(req: Pick<IncomingMessage, 'socket'>): string {
  return req.socket.remoteAddress ?? 'unknown'
}

/** The entries of a comma-separated forwarding header, trimmed, empty ones kept so a position never shifts. */
function entriesOf(value: string): readonly string[] {
  return value.split(',').map((entry) => entry.trim())
}

/**
 * The address the rate limiter, the audit trail and the moderation rules
 * should attribute this request to.
 */
export function resolveClientAddress(
  req: Pick<IncomingMessage, 'headers' | 'socket'>,
  rule: TrustRule,
): string {
  if (rule.kind === 'none' || !comesFromTrustedProxy(req, rule)) return socketAddress(req)

  if (rule.kind === 'header') {
    const value = headerOf(req, rule.header)
    if (value === undefined) return socketAddress(req)
    // A single-address header; a list means something upstream appended, and
    // the proxy's own value is then the last one.
    const entries = entriesOf(value)
    const address = parseAddress(entries[entries.length - 1] ?? '')
    return address ?? socketAddress(req)
  }

  const forwarded = headerOf(req, 'x-forwarded-for')
  if (forwarded === undefined) return socketAddress(req)
  const entries = entriesOf(forwarded)
  // Fewer entries than proxies we were told to expect: the header did not
  // pass through them all, so nothing in it can be attributed with confidence.
  const entry = entries[entries.length - rule.count]
  if (entry === undefined) return socketAddress(req)
  return parseAddress(entry) ?? socketAddress(req)
}

/**
 * True behind a TLS socket, or behind a proxy that says it terminated one.
 *
 * `x-forwarded-proto` has always been honoured here, with or without a
 * `trustProxy` setting: spoofing it can only make the spoofer's own response
 * carry HSTS or a `Secure` cookie, which is not a gain. With a hop count the
 * entry for that hop is read, like the address — clamped to the first entry,
 * because a proxy that overwrites the header rather than appending to it
 * leaves one value for the whole chain; otherwise the first entry.
 */
export function isSecureRequest(
  req: Pick<IncomingMessage, 'headers' | 'socket'>,
  rule: TrustRule,
): boolean {
  if ('encrypted' in req.socket && req.socket.encrypted === true) return true
  const forwarded = headerOf(req, 'x-forwarded-proto')
  if (forwarded === undefined) return false
  const entries = entriesOf(forwarded)
  const entry =
    rule.kind === 'hops' ? entries[Math.max(0, entries.length - rule.count)] : entries[0]
  return entry?.toLowerCase() === 'https'
}

const resolved = new WeakMap<object, string>()

/** Computes the address once per request, at the top of the listener, so every later caller agrees. */
export function bindClientAddress(
  req: Pick<IncomingMessage, 'headers' | 'socket'>,
  rule: TrustRule,
): string {
  const address = resolveClientAddress(req, rule)
  resolved.set(req, address)
  return address
}

/** The address bound for this request, or the socket's when none was (a request that never reached the listener). */
export function clientAddressOf(req: Pick<IncomingMessage, 'headers' | 'socket'>): string {
  return resolved.get(req) ?? socketAddress(req)
}
