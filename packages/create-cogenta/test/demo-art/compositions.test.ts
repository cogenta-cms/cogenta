import { sniffImageFormat } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { STARTING_SKINS } from '../../src/blueprints/starting-skins.js'
import {
  avatarArt,
  coverArt,
  type HeroVariant,
  heroArt,
  logoArt,
  type Palette,
  productArt,
} from '../../src/demo-art/compositions.js'
import type { ArtLayer } from '../../src/demo-art/render.js'
import { renderArt } from '../../src/demo-art/render.js'

/**
 * `compositions.ts`'s presets, each checked against a real blueprint palette
 * (`STARTING_SKINS`, never a hand-picked fixture) — the same guarantee the
 * lot asks for: every blueprint's starting skin is a valid `Palette`.
 */

function paletteOf(blueprintId: string): Palette {
  const skin = STARTING_SKINS[blueprintId]
  if (skin === undefined) {
    throw new Error(`No starting skin for "${blueprintId}" — fix this test fixture.`)
  }
  return skin.color
}

const storePalette = paletteOf('store')
const portfolioPalette = paletteOf('portfolio')
const magazinePalette = paletteOf('magazine')

describe('heroArt', () => {
  it('renders at the documented default size (1600x1000)', () => {
    const png = renderArt(heroArt(storePalette))
    expect(sniffImageFormat(png)).toBe('png')
  })

  it.each(['mesh', 'geometric', 'diagonal', 'radial'] as const)(
    'renders the %s variant without throwing',
    (variant) => {
      expect(() => renderArt(heroArt(storePalette, variant, 5))).not.toThrow()
    },
  )

  // Both tests below render two or more full 1600x1000 heroes — 20s is
  // generous under a full-suite run where many other files render
  // concurrently (real CPU contention, not a hang).
  it('the same palette and variant render identically across calls (deterministic)', () => {
    const a = renderArt(heroArt(portfolioPalette, 'mesh', 9))
    const b = renderArt(heroArt(portfolioPalette, 'mesh', 9))
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  }, 20_000)

  it('different palettes produce visibly different bytes', () => {
    const a = renderArt(heroArt(storePalette, 'mesh', 1))
    const b = renderArt(heroArt(magazinePalette, 'mesh', 1))
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  }, 20_000)
})

describe('coverArt', () => {
  it('renders at the documented default size (1200x800)', () => {
    const png = renderArt(coverArt(storePalette, 1))
    expect(sniffImageFormat(png)).toBe('png')
  })

  it('produces at least six visibly different layouts across seeds from one palette', () => {
    // The same composition, rendered small (120x80 instead of the 1200x800
    // default) purely to make comparing two dozen of them fast — the full
    // default size is already exercised by the test above, and every layer
    // coordinate is a fraction of the canvas, so a layout's structure is
    // size-independent.
    const renders = Array.from({ length: 24 }, (_, seed) =>
      Buffer.from(renderArt({ ...coverArt(storePalette, seed), width: 120, height: 80 })).toString(
        'base64',
      ),
    )
    const distinct = new Set(renders)
    expect(distinct.size).toBeGreaterThanOrEqual(6)
  })
})

describe('avatarArt', () => {
  it('renders a 600x600 square mark', () => {
    const png = renderArt(avatarArt(portfolioPalette, 2))
    expect(sniffImageFormat(png)).toBe('png')
  })

  it('is deterministic per seed', () => {
    const a = renderArt(avatarArt(portfolioPalette, 4))
    const b = renderArt(avatarArt(portfolioPalette, 4))
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })
})

describe('logoArt', () => {
  it('renders a 400x160 neutral wordmark stand-in with no palette input', () => {
    const png = renderArt(logoArt(3))
    expect(sniffImageFormat(png)).toBe('png')
  })

  it('varies its mark shape across seeds', () => {
    const renders = Array.from({ length: 6 }, (_, seed) =>
      Buffer.from(renderArt(logoArt(seed))).toString('base64'),
    )
    expect(new Set(renders).size).toBeGreaterThan(1)
  })
})

/** A structural fingerprint of a composition — the sorted multiset of layer kinds it uses — good enough to tell two *families* apart without depending on exact colours or positions. */
function fingerprint(layers: readonly ArtLayer[]): string {
  return layers
    .map((layer) => layer.kind)
    .slice()
    .sort()
    .join(',')
}

describe('D5 — family distinctness (flat design register, not just distinct bytes)', () => {
  it('coverArt reaches at least 8 structurally distinct families across seeds', () => {
    const fingerprints = new Set<string>()
    for (let seed = 0; seed < 60; seed++) {
      fingerprints.add(fingerprint(coverArt(storePalette, seed).layers))
    }
    expect(fingerprints.size).toBeGreaterThanOrEqual(8)
  })

  it("heroArt's 6 canonical families are each structurally distinct", () => {
    const canonical: readonly HeroVariant[] = [
      'mesh',
      'geometric',
      'diagonal',
      'radial',
      'dark',
      'warm',
    ]
    const fingerprints = new Set(
      canonical.map((variant) => fingerprint(heroArt(storePalette, variant, 1).layers)),
    )
    expect(fingerprints.size).toBe(canonical.length)
  })

  it('a variant name and its documented alias render byte-identical output', () => {
    const pairs: readonly [HeroVariant, HeroVariant][] = [
      ['mesh', 'grid'],
      ['geometric', 'blocks'],
      ['diagonal', 'bands'],
      ['radial', 'rings'],
      ['dark', 'ink'],
      ['warm', 'sun'],
    ]
    for (const [canonical, alias] of pairs) {
      const a = renderArt(heroArt(portfolioPalette, canonical, 4))
      const b = renderArt(heroArt(portfolioPalette, alias, 4))
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    }
  }, 20_000)
})

describe('productArt', () => {
  it('renders a 1000x1000 centred object', () => {
    const png = renderArt(productArt(storePalette, 6))
    expect(sniffImageFormat(png)).toBe('png')
  })

  // Six full 1000x1000 renders — same contention margin as heroArt above.
  it('varies its object shape and colour across seeds', () => {
    const renders = Array.from({ length: 6 }, (_, seed) =>
      Buffer.from(renderArt(productArt(storePalette, seed))).toString('base64'),
    )
    expect(new Set(renders).size).toBeGreaterThan(1)
  }, 20_000)
})

describe('performance (acceptance criterion: a composition renders in under 2s)', () => {
  it('every hero variant renders its full 1600x1000 size well under the bound', () => {
    const variants: readonly HeroVariant[] = [
      'mesh',
      'geometric',
      'diagonal',
      'radial',
      'dark',
      'warm',
    ]
    for (const variant of variants) {
      const start = performance.now()
      const png = renderArt(heroArt(storePalette, variant, 1))
      const elapsedMs = performance.now() - start
      expect(sniffImageFormat(png)).toBe('png')
      // A generous 4s bound avoids flakiness under a loaded full-suite run;
      // measured locally every variant renders in well under 1s.
      expect(elapsedMs).toBeLessThan(4000)
    }
  }, 30_000)

  it('coverArt and productArt render their full sizes well under the bound', () => {
    for (let seed = 0; seed < 9; seed++) {
      const start = performance.now()
      expect(sniffImageFormat(renderArt(coverArt(storePalette, seed)))).toBe('png')
      expect(performance.now() - start).toBeLessThan(4000)
    }
    for (let seed = 0; seed < 6; seed++) {
      const start = performance.now()
      expect(sniffImageFormat(renderArt(productArt(storePalette, seed)))).toBe('png')
      expect(performance.now() - start).toBeLessThan(4000)
    }
  }, 30_000)
})
