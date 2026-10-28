import { describe, expect, it } from 'vitest'
import {
  bindClientAddress,
  clientAddressOf,
  isSecureRequest,
  resolveClientAddress,
  type TrustRule,
  trustProxyWarning,
  trustRuleFor,
} from '../src/commands/client-address.js'

/** The two fields the resolver reads — a real `IncomingMessage` carries many more. */
function request(
  headers: Record<string, string | string[]>,
  remoteAddress: string | null = '10.0.0.7',
  encrypted = false,
): Parameters<typeof resolveClientAddress>[0] {
  return {
    headers,
    socket: {
      remoteAddress: remoteAddress ?? undefined,
      ...(encrypted ? { encrypted: true } : {}),
    },
  } as unknown as Parameters<typeof resolveClientAddress>[0]
}

const OFF = trustRuleFor(false)

describe('trustRuleFor', () => {
  it('reads a number as a count of proxies and a name as a header', () => {
    expect(trustRuleFor(false)).toEqual({ kind: 'none' })
    expect(trustRuleFor(2)).toEqual({ kind: 'hops', count: 2 })
    expect(trustRuleFor('X-Real-IP')).toEqual({ kind: 'header', header: 'x-real-ip' })
  })

  it('maps the cloudflare alias to the header Cloudflare sets', () => {
    expect(trustRuleFor('cloudflare')).toEqual({ kind: 'header', header: 'cf-connecting-ip' })
    expect(trustRuleFor('Cloudflare')).toEqual({ kind: 'header', header: 'cf-connecting-ip' })
  })
})

describe('resolveClientAddress with proxy trust off', () => {
  it('uses the socket address and ignores every forwarding header', () => {
    const req = request({
      'x-forwarded-for': '203.0.113.9',
      'cf-connecting-ip': '203.0.113.10',
      'x-real-ip': '203.0.113.11',
    })
    expect(resolveClientAddress(req, OFF)).toBe('10.0.0.7')
  })

  it('reports "unknown" when the socket has no address', () => {
    expect(resolveClientAddress(request({}, null), OFF)).toBe('unknown')
  })
})

describe('resolveClientAddress with a trusted header', () => {
  const rule = trustRuleFor('cloudflare')

  it('takes the address from that header', () => {
    expect(resolveClientAddress(request({ 'cf-connecting-ip': '203.0.113.9' }), rule)).toBe(
      '203.0.113.9',
    )
  })

  it('accepts IPv6, with or without brackets and a port', () => {
    expect(resolveClientAddress(request({ 'cf-connecting-ip': '2001:db8::1' }), rule)).toBe(
      '2001:db8::1',
    )
    expect(resolveClientAddress(request({ 'cf-connecting-ip': '[2001:db8::1]:443' }), rule)).toBe(
      '2001:db8::1',
    )
  })

  it('strips the port of an IPv4 address', () => {
    expect(resolveClientAddress(request({ 'cf-connecting-ip': '203.0.113.9:51234' }), rule)).toBe(
      '203.0.113.9',
    )
  })

  it('falls back to the socket when the header is missing', () => {
    expect(resolveClientAddress(request({}), rule)).toBe('10.0.0.7')
  })

  it.each(['', 'not-an-ip', '999.1.1.1', '1.2.3', '203.0.113.9; drop table', 'unknown'])(
    'falls back to the socket when the header says %j',
    (value) => {
      expect(resolveClientAddress(request({ 'cf-connecting-ip': value }), rule)).toBe('10.0.0.7')
    },
  )

  it('reads another header when the operator names one', () => {
    const real = trustRuleFor('x-real-ip')
    expect(
      resolveClientAddress(
        request({ 'x-real-ip': '198.51.100.4', 'cf-connecting-ip': '203.0.113.9' }),
        real,
      ),
    ).toBe('198.51.100.4')
  })

  it('does not read x-forwarded-for when a different header is trusted', () => {
    expect(
      resolveClientAddress(
        request({ 'x-forwarded-for': '203.0.113.9' }),
        trustRuleFor('x-real-ip'),
      ),
    ).toBe('10.0.0.7')
  })
})

describe('resolveClientAddress counting proxies in x-forwarded-for', () => {
  it('takes the last entry behind one proxy', () => {
    const req = request({ 'x-forwarded-for': '198.51.100.4' })
    expect(resolveClientAddress(req, trustRuleFor(1))).toBe('198.51.100.4')
  })

  it('ignores what the client prepended: the trusted end is the right-hand one', () => {
    // The visitor sent "1.1.1.1"; the single trusted proxy appended the
    // address it actually saw connect.
    const req = request({ 'x-forwarded-for': '1.1.1.1, 198.51.100.4' })
    expect(resolveClientAddress(req, trustRuleFor(1))).toBe('198.51.100.4')
  })

  it('takes the second from the right behind two proxies', () => {
    const req = request({ 'x-forwarded-for': '1.1.1.1, 198.51.100.4, 172.16.0.9' })
    expect(resolveClientAddress(req, trustRuleFor(2))).toBe('198.51.100.4')
  })

  it('joins repeated headers the way Node does', () => {
    const req = request({ 'x-forwarded-for': ['1.1.1.1', '198.51.100.4'] })
    expect(resolveClientAddress(req, trustRuleFor(1))).toBe('198.51.100.4')
  })

  it('falls back to the socket when the chain is shorter than the proxies configured', () => {
    // Two proxies were promised, one entry arrived: the header did not pass
    // through the whole chain, so it cannot be attributed.
    const req = request({ 'x-forwarded-for': '203.0.113.9' })
    expect(resolveClientAddress(req, trustRuleFor(2))).toBe('10.0.0.7')
  })

  it('falls back to the socket when the header is absent', () => {
    expect(resolveClientAddress(request({}), trustRuleFor(1))).toBe('10.0.0.7')
  })

  it.each(['garbage', ', ,', '1.1.1.1, , ', '1.1.1.1, <script>'])(
    'falls back to the socket for the malformed chain %j',
    (value) => {
      expect(resolveClientAddress(request({ 'x-forwarded-for': value }), trustRuleFor(1))).toBe(
        '10.0.0.7',
      )
    },
  )

  it('does not honour a count that is too small as if it were larger', () => {
    // One trusted hop must not return the spoofed left-hand entry.
    const req = request({ 'x-forwarded-for': '203.0.113.99, 198.51.100.4' })
    expect(resolveClientAddress(req, trustRuleFor(1))).not.toBe('203.0.113.99')
  })
})

describe('resolveClientAddress limited to named proxies (trustProxyFrom)', () => {
  const forwarded = { 'x-forwarded-for': '198.51.100.4' }
  const rule = trustRuleFor(1, ['10.0.0.0/8', 'fd00::/8', '192.0.2.1'])

  it('honours the header from a socket inside a CIDR block', () => {
    expect(resolveClientAddress(request(forwarded, '10.1.2.3'), rule)).toBe('198.51.100.4')
  })

  it('honours the header from a socket that is a listed address', () => {
    expect(resolveClientAddress(request(forwarded, '192.0.2.1'), rule)).toBe('198.51.100.4')
  })

  it('ignores the header from a socket outside every block, so a direct caller cannot choose its address', () => {
    expect(resolveClientAddress(request(forwarded, '203.0.113.50'), rule)).toBe('203.0.113.50')
    expect(
      resolveClientAddress(
        request(forwarded, '203.0.113.50'),
        trustRuleFor('cloudflare', ['10.0.0.0/8']),
      ),
    ).toBe('203.0.113.50')
  })

  it('ignores the header when the socket has no address', () => {
    expect(resolveClientAddress(request(forwarded, null), rule)).toBe('unknown')
  })

  it('matches an IPv6 socket against an IPv6 block', () => {
    expect(resolveClientAddress(request(forwarded, 'fd00::7'), rule)).toBe('198.51.100.4')
    expect(resolveClientAddress(request(forwarded, 'fe80::7'), rule)).toBe('fe80::7')
  })

  it('treats an IPv4-mapped IPv6 socket address as the IPv4 address it carries', () => {
    expect(resolveClientAddress(request(forwarded, '::ffff:10.1.2.3'), rule)).toBe('198.51.100.4')
    expect(resolveClientAddress(request(forwarded, '::ffff:203.0.113.50'), rule)).toBe(
      '::ffff:203.0.113.50',
    )
  })

  it('believes any socket when no proxy is named', () => {
    expect(resolveClientAddress(request(forwarded, '203.0.113.50'), trustRuleFor(1, []))).toBe(
      '198.51.100.4',
    )
  })

  it('leaves the rule without an allow-list untouched', () => {
    expect(trustRuleFor(2)).toEqual({ kind: 'hops', count: 2 })
  })
})

describe('isSecureRequest', () => {
  const hops: TrustRule = trustRuleFor(2)

  it('is true on a TLS socket whatever the headers say', () => {
    expect(isSecureRequest(request({}, '10.0.0.7', true), OFF)).toBe(true)
  })

  it('reads x-forwarded-proto, first entry, when no hop count is set', () => {
    expect(isSecureRequest(request({ 'x-forwarded-proto': 'https' }), OFF)).toBe(true)
    expect(isSecureRequest(request({ 'x-forwarded-proto': 'https, http' }), OFF)).toBe(true)
    expect(isSecureRequest(request({ 'x-forwarded-proto': 'http' }), OFF)).toBe(false)
    expect(isSecureRequest(request({}), OFF)).toBe(false)
  })

  it('reads the entry for the configured hop when a count is set', () => {
    // Visitor-prepended "https" is on the left; the trusted proxies wrote the rest.
    expect(isSecureRequest(request({ 'x-forwarded-proto': 'https, http, http' }), hops)).toBe(false)
    expect(isSecureRequest(request({ 'x-forwarded-proto': 'http, https, http' }), hops)).toBe(true)
  })

  it('accepts a single value from a proxy that overwrites the header', () => {
    expect(isSecureRequest(request({ 'x-forwarded-proto': 'https' }), hops)).toBe(true)
  })
})

describe('the per-request binding', () => {
  it('returns what the listener decided, and the socket for a request it never saw', () => {
    const seen = request({ 'x-forwarded-for': '198.51.100.4' })
    bindClientAddress(seen, trustRuleFor(1))
    expect(clientAddressOf(seen)).toBe('198.51.100.4')

    const unseen = request({ 'x-forwarded-for': '198.51.100.4' })
    expect(clientAddressOf(unseen)).toBe('10.0.0.7')
  })
})

describe('trustProxyWarning', () => {
  it('warns when a header is trusted from any socket', () => {
    expect(trustProxyWarning({ trustProxy: 1, trustProxyFrom: [] })).toMatch(
      /trustProxyFrom is empty/u,
    )
    expect(trustProxyWarning({ trustProxy: 'cloudflare', trustProxyFrom: [] })).toBeDefined()
  })

  it('stays quiet when proxies are named or nothing is trusted', () => {
    expect(trustProxyWarning({ trustProxy: 1, trustProxyFrom: ['10.0.0.0/8'] })).toBeUndefined()
    expect(trustProxyWarning({ trustProxy: false, trustProxyFrom: [] })).toBeUndefined()
  })
})
