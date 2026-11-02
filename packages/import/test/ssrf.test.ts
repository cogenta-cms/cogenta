import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { CogentaError } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertPublicUrl,
  createPinnedFetch,
  isPrivateAddress,
  resolvePublicTarget,
} from '../src/ssrf.js'

describe('isPrivateAddress', () => {
  it.each([
    // IPv4: every special-purpose block, at both ends.
    ['0.0.0.0', true],
    ['0.255.255.255', true],
    ['10.0.0.5', true],
    ['100.64.0.1', true], // carrier-grade NAT
    ['100.127.255.254', true],
    ['100.128.0.1', false],
    ['127.0.0.1', true],
    ['127.255.255.255', true],
    ['169.254.169.254', true], // cloud instance metadata
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['192.0.0.8', true],
    ['192.0.2.7', true], // documentation
    ['192.168.1.1', true],
    ['198.18.0.1', true], // benchmarking
    ['198.19.255.255', true],
    ['198.51.100.9', true], // documentation
    ['203.0.113.9', true], // documentation
    ['224.0.0.1', true], // multicast
    ['240.0.0.1', true], // reserved
    ['255.255.255.255', true], // limited broadcast
    ['8.8.8.8', false],
    ['93.184.216.34', false],
    ['1.1.1.1', false],
  ])('classifies the IPv4 address %s as private=%s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected)
  })

  it.each([
    // Loopback and unspecified, in every spelling.
    ['::1', true],
    ['0:0:0:0:0:0:0:1', true],
    ['0000:0000:0000:0000:0000:0000:0000:0001', true],
    ['::', true],
    // Link-local is fe80::/10, not only the fe80: prefix.
    ['fe80::1', true],
    ['fe90::1', true],
    ['febf::1', true],
    ['fec0::1', true], // site-local, deprecated
    ['fe7f::1', true], // outside every public block all the same
    // Unique-local fc00::/7.
    ['fc00::1', true],
    ['fd12:3456::1', true],
    // Multicast.
    ['ff02::1', true],
    ['ff0e::1', true],
    // IPv4-mapped, dotted and hex, judged by the embedded IPv4 address.
    ['::ffff:127.0.0.1', true],
    ['::ffff:7f00:1', true],
    ['::ffff:10.1.2.3', true],
    ['::ffff:a9fe:a9fe', true],
    ['::ffff:8.8.8.8', false],
    ['::ffff:808:808', false],
    // IPv4-compatible and NAT64.
    ['::7f00:1', true],
    ['64:ff9b::7f00:1', true],
    ['64:ff9b::a00:1', true],
    ['64:ff9b::808:808', false],
    ['64:ff9b:1::1', true], // local-use NAT64
    // 6to4 carries an IPv4 address in bits 16-47.
    ['2002:7f00:1::', true],
    ['2002:a9fe:a9fe::1', true],
    ['2002:808:808::1', false],
    // Teredo, documentation, discard.
    ['2001::1', true],
    ['2001:db8::1', true],
    ['3fff::1', true],
    ['100::1', true],
    // Global unicast.
    ['2606:4700:4700::1111', false],
    ['2a00:1450:4009:81f::200e', false],
    ['2001:4860:4860::8888', false],
  ])('classifies the IPv6 address %s as private=%s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected)
  })

  it('refuses text that is not an address rather than guess', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true)
    expect(isPrivateAddress('')).toBe(true)
  })
})

describe('assertPublicUrl', () => {
  it('refuses a literal loopback address without needing DNS', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/x')).rejects.toThrow(CogentaError)
  })

  it('refuses the "localhost" host name', async () => {
    await expect(assertPublicUrl('http://localhost:5432/')).rejects.toThrow(CogentaError)
  })

  it('refuses a non-http(s) protocol', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(CogentaError)
  })

  it('refuses an unparseable URL', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toThrow(CogentaError)
  })

  it('refuses a host name that resolves to a private address (DNS rebinding)', async () => {
    const lookupImpl = (async () => [{ address: '169.254.169.254', family: 4 }]) as never
    await expect(
      assertPublicUrl('http://attacker.example/img.jpg', { lookupImpl }),
    ).rejects.toThrow(CogentaError)
  })

  it('accepts a host name that resolves only to public addresses', async () => {
    const lookupImpl = (async () => [{ address: '93.184.216.34', family: 4 }]) as never
    await expect(
      assertPublicUrl('http://example.com/img.jpg', { lookupImpl }),
    ).resolves.toBeUndefined()
  })

  it('refuses when the host name cannot be resolved at all', async () => {
    const lookupImpl = (async () => {
      throw new Error('ENOTFOUND')
    }) as never
    await expect(assertPublicUrl('http://nowhere.invalid/x', { lookupImpl })).rejects.toThrow(
      CogentaError,
    )
  })
})

describe('assertPublicUrl, bracketed IPv6 literals', () => {
  it.each([
    'http://[::1]/x',
    'http://[fe90::1]/x',
    'http://[::ffff:7f00:1]/x',
    'http://[fd00::1]/',
  ])('refuses %s', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow(CogentaError)
  })

  it('accepts a public IPv6 literal', async () => {
    await expect(assertPublicUrl('http://[2606:4700:4700::1111]/x')).resolves.toBeUndefined()
  })
})

describe('resolvePublicTarget', () => {
  it('returns the validated address, resolving the host name exactly once', async () => {
    let calls = 0
    const lookupImpl = (async () => {
      calls += 1
      return [{ address: '93.184.216.34', family: 4 }]
    }) as never

    const target = await resolvePublicTarget('https://cdn.example/a.jpg', { lookupImpl })

    expect(target.address).toBe('93.184.216.34')
    expect(target.family).toBe(4)
    expect(target.url.hostname).toBe('cdn.example')
    expect(calls).toBe(1)
  })

  it('refuses a host name when any one of its answers is private', async () => {
    const lookupImpl = (async () => [
      { address: '93.184.216.34', family: 4 },
      { address: 'fe90::1', family: 6 },
    ]) as never

    await expect(resolvePublicTarget('http://mixed.example/', { lookupImpl })).rejects.toThrow(
      CogentaError,
    )
  })
})

describe('createPinnedFetch', () => {
  let server: Server | undefined

  afterEach(async () => {
    await new Promise<void>((done) => (server === undefined ? done() : server.close(() => done())))
    server = undefined
  })

  async function listen(seen: {
    host?: string | undefined
    url?: string | undefined
  }): Promise<number> {
    server = createServer((req, res) => {
      seen.host = req.headers.host
      seen.url = req.url
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('pinned')
    })
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
    return (server.address() as AddressInfo).port
  }

  it('connects to the validated address and never resolves the host name again', async () => {
    const seen: { host?: string | undefined; url?: string | undefined } = {}
    const port = await listen(seen)
    // The name resolves nowhere (`.invalid` is reserved): only the pinned
    // address can have been used for this request to arrive.
    const url = new URL(`http://pinned.invalid:${port}/a/b.jpg?x=1`)

    const response = await createPinnedFetch()(
      { url, address: '127.0.0.1', family: 4 },
      { method: 'GET' },
    )

    expect(await response.text()).toBe('pinned')
    expect(response.status).toBe(200)
    expect(seen.host).toBe(`pinned.invalid:${port}`)
    expect(seen.url).toBe('/a/b.jpg?x=1')
  })

  it('does not follow a redirect by itself', async () => {
    server = createServer((_req, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/' })
      res.end()
    })
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
    const port = (server.address() as AddressInfo).port

    const response = await createPinnedFetch()(
      { url: new URL(`http://pinned.invalid:${port}/`), address: '127.0.0.1', family: 4 },
      {},
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://169.254.169.254/')
  })
})
