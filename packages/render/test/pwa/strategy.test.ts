import { describe, expect, it } from 'vitest'
import { chooseStrategy, DEFAULT_ROUTES } from '../../src/pwa/strategy.js'
import type { RequestDescriptor, RouteRule } from '../../src/pwa/types.js'

const ORIGIN = 'https://example.test'

function request(path: string, overrides: Partial<RequestDescriptor> = {}): RequestDescriptor {
  return {
    method: 'GET',
    url: path.startsWith('http') ? path : `${ORIGIN}${path}`,
    origin: ORIGIN,
    destination: '',
    mode: 'no-cors',
    cacheMode: 'default',
    hasRange: false,
    ...overrides,
  }
}

const decide = (path: string, overrides: Partial<RequestDescriptor> = {}) =>
  chooseStrategy(request(path, overrides), DEFAULT_ROUTES)

describe('choosing a cache strategy per resource type', () => {
  it('goes to the network first for a page, so a published change is never hidden by a cache', () => {
    const decision = decide('/blog/hello', { mode: 'navigate', destination: 'document' })

    expect(decision.strategy).toBe('network-first')
    expect(decision.bucket).toBe('documents')
    expect(decision.networkTimeoutMs).toBe(3000)
  })

  it('treats a navigation as a document even when the destination is empty', () => {
    expect(decide('/', { mode: 'navigate' }).ruleId).toBe('documents')
  })

  it('serves a fingerprinted asset from cache without revalidating, because its url changes with its content', () => {
    const decision = decide('/_astro/page.C0ffee12.js', { destination: 'script' })

    expect(decision.strategy).toBe('cache-first')
    expect(decision.bucket).toBe('assets')
  })

  it('treats a hashed font as immutable too', () => {
    expect(decide('/fonts/inter.9a8b7c6d.woff2', { destination: 'font' }).strategy).toBe(
      'cache-first',
    )
  })

  it('revalidates an asset served from a stable url, since its body can change underneath', () => {
    const decision = decide('/styles/site.css', { destination: 'style' })

    expect(decision.strategy).toBe('stale-while-revalidate')
    expect(decision.ruleId).toBe('mutable-assets')
  })

  it('serves an image stale and refreshes it, and caps the bucket so a phone does not fill up', () => {
    const decision = decide('/media/cover.jpg', { destination: 'image' })

    expect(decision.strategy).toBe('stale-while-revalidate')
    expect(decision.bucket).toBe('images')
    expect(decision.maxEntries).toBe(80)
  })

  it('never serves api data stale, because stale json makes the interface assert something false', () => {
    const decision = decide('/api/content/posts?page=2')

    expect(decision.strategy).toBe('network-first')
    expect(decision.bucket).toBe('data')
  })

  it('gives every cached bucket a cap', () => {
    for (const rule of DEFAULT_ROUTES) {
      expect(rule.maxEntries, `rule ${rule.id} is uncapped`).not.toBeNull()
    }
  })
})

describe('refusing to touch requests a cache would answer wrongly', () => {
  it('bypasses a non-GET request, which the cache api cannot key on anyway', () => {
    const decision = decide('/api/comments', { method: 'POST' })

    expect(decision.strategy).toBe('network-only')
    expect(decision.reason).toContain('POST')
  })

  it('bypasses a hard reload instead of overruling the visitor', () => {
    expect(decide('/', { mode: 'navigate', cacheMode: 'reload' }).strategy).toBe('network-only')
    expect(decide('/api/x', { cacheMode: 'no-store' }).strategy).toBe('network-only')
  })

  it('bypasses a ranged request, whose body is a fragment and not a page', () => {
    const decision = decide('/media/talk.mp4', { destination: 'video', hasRange: true })

    expect(decision.strategy).toBe('network-only')
    expect(decision.reason).toContain('partial')
  })

  it('bypasses a cross-origin request, whose response status it cannot even read', () => {
    const decision = decide('https://cdn.example.com/a.C0ffee12.js', { destination: 'script' })

    expect(decision.strategy).toBe('network-only')
    expect(decision.reason).toBe('cross-origin request')
  })

  it('bypasses anything no rule claims, rather than defaulting to a cache', () => {
    const decision = decide('/downloads/report.pdf', { destination: 'object' })

    expect(decision.strategy).toBe('network-only')
    expect(decision.ruleId).toBe('bypass')
  })

  it('bypasses a url it cannot parse instead of throwing inside a fetch handler', () => {
    expect(chooseStrategy(request('/'), DEFAULT_ROUTES).strategy).toBe('network-only')
    expect(
      chooseStrategy({ ...request('/'), url: 'not a url', mode: 'navigate' }, DEFAULT_ROUTES)
        .strategy,
    ).toBe('network-only')
  })
})

describe('the route table as data', () => {
  it('applies rules in declaration order, so a site can prepend its own', () => {
    const own: RouteRule = {
      id: 'admin-never-cached',
      destinations: [],
      pattern: '^/admin/',
      crossOrigin: false,
      strategy: 'network-only',
      bucket: 'documents',
      maxEntries: null,
      networkTimeoutMs: null,
    }
    const routes = [own, ...DEFAULT_ROUTES]

    const decision = chooseStrategy(
      request('/admin/posts', { mode: 'navigate', destination: 'document' }),
      routes,
    )

    expect(decision.ruleId).toBe('admin-never-cached')
    expect(decision.strategy).toBe('network-only')
  })

  it('applies a cross-origin rule only when the rule opts in', () => {
    const fonts: RouteRule = {
      id: 'cdn-fonts',
      destinations: ['font'],
      pattern: null,
      crossOrigin: true,
      strategy: 'cache-first',
      bucket: 'assets',
      maxEntries: 10,
      networkTimeoutMs: null,
    }

    const decision = chooseStrategy(
      request('https://fonts.example.com/inter.woff2', { destination: 'font' }),
      [fonts],
    )

    expect(decision.ruleId).toBe('cdn-fonts')
  })

  it('is serialisable, because the generated worker carries it as json', () => {
    expect(JSON.parse(JSON.stringify(DEFAULT_ROUTES))).toEqual(DEFAULT_ROUTES)
  })
})
