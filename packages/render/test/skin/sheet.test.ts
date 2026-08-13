import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import type { SkinSheet } from '../../src/skin/index.js'
import { createSkinStore, renderSkin } from '../../src/skin/index.js'
import { skin, VALID_SKIN } from './fixtures.js'

const DARK = {
  ...VALID_SKIN,
  color: {
    bg: '#101216',
    fg: '#e9eaee',
    accent: '#7aa2f7',
    accentFg: '#0b0d11',
    muted: '#1c1f26',
    mutedFg: '#b8bcc6',
    border: '#2a2e37',
  },
}

describe('hot skin swap', () => {
  it('serves the initial skin as a rendered sheet with an ETag', () => {
    const store = createSkinStore(VALID_SKIN)
    const sheet = store.current()

    expect(sheet.css).toContain('--cogenta-color-bg: #ffffff;')
    expect(sheet.etag).toMatch(/^"[0-9a-f]{8}"$/)
  })

  it('rewrites the sheet when the skin changes, with no build step', () => {
    const store = createSkinStore(VALID_SKIN)
    const before = store.current()

    const after = store.apply(DARK)

    expect(after.css).toContain('--cogenta-color-bg: #101216;')
    expect(after.css).not.toContain('#ffffff;')
    expect(after.etag).not.toBe(before.etag)
    expect(store.current()).toBe(after)
  })

  it('gives identical tokens an identical ETag, so caches are not busted for nothing', () => {
    const store = createSkinStore(VALID_SKIN)
    const first = store.current().etag
    expect(store.apply(skin()).etag).toBe(first)
  })

  it('keeps the previous skin live when the new one is refused', () => {
    const store = createSkinStore(VALID_SKIN)
    const before = store.current()

    const broken = skin()
    broken.color.fg = '#777777'
    broken.color.bg = '#ffffff'

    expect(() => store.apply(broken)).toThrowError(CogentaError)
    expect(store.current()).toBe(before)
    expect(store.current().css).toBe(before.css)
  })

  it('notifies the persistence callback only after the swap is live', () => {
    const seen: string[] = []
    const store = createSkinStore(VALID_SKIN, {
      onSwap: (sheet: SkinSheet) => {
        seen.push(sheet.etag)
        // The sheet is already the current one by the time this runs; writing
        // it to disk or to a CDN never blocks the swap.
        expect(store.current()).toBe(sheet)
      },
    })

    const next = store.apply(DARK)
    expect(seen).toEqual([next.etag])
  })

  it('changes skin in well under a second, which is the acceptance criterion', () => {
    const store = createSkinStore(VALID_SKIN)

    const start = performance.now()
    const sheet = store.apply(DARK)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(1000)
    expect(sheet.renderedIn).toBeLessThan(1000)
    // Not a build: a full validate-and-render is a sub-millisecond operation,
    // and the margin is what proves no compilation is hiding in the path.
    expect(elapsed).toBeLessThan(50)
  })

  it('stays under a second across a hundred consecutive swaps', () => {
    const store = createSkinStore(VALID_SKIN)
    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      store.apply(i % 2 === 0 ? DARK : VALID_SKIN)
    }
    expect(performance.now() - start).toBeLessThan(1000)
  })

  it('reports the render time it measured', () => {
    expect(renderSkin(VALID_SKIN).renderedIn).toBeGreaterThanOrEqual(0)
  })
})
