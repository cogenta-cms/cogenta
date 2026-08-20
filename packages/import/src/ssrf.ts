import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { CogentaError } from '@cogenta/core'

/**
 * Guards against a remote-media download becoming a request an attacker
 * chose the destination of (fiche 25, pièges connus: "les médias distants
 * sont des requêtes sortantes vers des URL fournies par un fichier").
 *
 * A WXR, an RSS feed or a CSV cell is untrusted input (rule R8) that this
 * import turns into an outbound `fetch`. Without this check, an attacker who
 * can get their export imported can make the server fetch
 * `http://169.254.169.254/latest/meta-data/` (cloud instance metadata) or
 * `http://localhost:5432` (a database port) and, through the image that gets
 * stored, read the response back.
 */

const PRIVATE_IPV4_RANGES: readonly [number, number][] = [
  [ipToInt('0.0.0.0'), ipToInt('0.255.255.255')],
  [ipToInt('10.0.0.0'), ipToInt('10.255.255.255')],
  [ipToInt('100.64.0.0'), ipToInt('100.127.255.255')], // CGNAT
  [ipToInt('127.0.0.0'), ipToInt('127.255.255.255')], // loopback
  [ipToInt('169.254.0.0'), ipToInt('169.254.255.255')], // link-local, cloud metadata
  [ipToInt('172.16.0.0'), ipToInt('172.31.255.255')],
  [ipToInt('192.0.0.0'), ipToInt('192.0.0.255')],
  [ipToInt('192.168.0.0'), ipToInt('192.168.255.255')],
  [ipToInt('198.18.0.0'), ipToInt('198.19.255.255')], // benchmarking
  [ipToInt('224.0.0.0'), ipToInt('255.255.255.255')], // multicast/reserved
]

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return (
    ((parts[0] ?? 0) << 24) + ((parts[1] ?? 0) << 16) + ((parts[2] ?? 0) << 8) + (parts[3] ?? 0)
  )
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipToInt(ip) >>> 0
  return PRIVATE_IPV4_RANGES.some(([start, end]) => value >= start >>> 0 && value <= end >>> 0)
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  return (
    lower === '::1' || // loopback
    lower.startsWith('fe80:') || // link-local
    lower.startsWith('fc') || // unique local fc00::/7
    lower.startsWith('fd') ||
    lower.startsWith('::ffff:') // IPv4-mapped — check the embedded address too
  )
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIpv4(ip)
  if (isIP(ip) === 6) {
    if (isPrivateIpv6(ip)) return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
    return mapped?.[1] !== undefined && isPrivateIpv4(mapped[1])
  }
  return true // not a recognisable literal — refuse rather than guess
}

function unsafeUrl(url: string, reason: string): CogentaError {
  return new CogentaError({
    code: 'IMPORT_MEDIA_URL_UNSAFE',
    message: `"${url}" cannot be fetched: ${reason}.`,
    hint: 'Only public http(s) URLs are downloaded during import. Host the file publicly, or upload it directly.',
    details: { url },
  })
}

/**
 * Resolves the URL's host and throws if it (or any of its resolved
 * addresses) is a loopback, link-local or otherwise private address —
 * checked on the resolved IP, not the hostname, so `http://a.b.c` that
 * resolves to `127.0.0.1` (DNS rebinding) is refused just the same.
 */
export async function assertPublicUrl(
  url: string,
  options: { readonly lookupImpl?: typeof lookup } = {},
): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw unsafeUrl(url, 'not a valid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw unsafeUrl(url, `protocol "${parsed.protocol}" is not allowed`)
  }

  const hostname = parsed.hostname
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw unsafeUrl(url, 'localhost is not a public address')
  }

  if (isIP(hostname) !== 0) {
    if (isPrivateAddress(hostname)) throw unsafeUrl(url, 'resolves to a private address')
    return
  }

  const doLookup = options.lookupImpl ?? lookup
  let addresses: { readonly address: string }[]
  try {
    const result = await doLookup(hostname, { all: true })
    addresses = Array.isArray(result) ? result : [result]
  } catch {
    throw unsafeUrl(url, 'the host name could not be resolved')
  }

  if (addresses.length === 0) throw unsafeUrl(url, 'the host name resolved to nothing')
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw unsafeUrl(url, 'resolves to a private address')
  }
}
