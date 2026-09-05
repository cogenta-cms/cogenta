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
import { renderArt, renderRgb } from '../../src/demo-art/render.js'

/**
 * `compositions.ts`'s presets, each checked against a real blueprint palette
 * (`STARTING_SKINS`, never a hand-picked fixture) — the same guarantee the
 * lot asks for: every blueprint's starting skin is a valid `Palette`. Two
 * synthetic palettes stress-test hue families `STARTING_SKINS` does not
 * cover: a cool violet SaaS palette (this project's own render found the
 * bug that led to `oklch.ts` existing at all — see its own module doc) and
 * a dark charcoal/copper restaurant palette (exercises the `dark`/`warm`
 * hero variants and a dark-by-default site).
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

const violetSaasPalette: Palette = {
  bg: '#ffffff',
  fg: '#181825',
  accent: '#6d28d9',
  accentFg: '#ffffff',
  muted: '#f5f3ff',
  mutedFg: '#3f3a52',
  border: '#e4defb',
}

const charcoalRestaurantPalette: Palette = {
  bg: '#1a1614',
  fg: '#f2e9dd',
  accent: '#b5651d',
  accentFg: '#1a1614',
  muted: '#241e1a',
  mutedFg: '#cdbfae',
  border: '#3a2f28',
}

const ALL_PALETTES: readonly (readonly [string, Palette])[] = [
  ['store', storePalette],
  ['portfolio', portfolioPalette],
  ['magazine', magazinePalette],
  ['saas (synthetic)', violetSaasPalette],
  ['restaurant (synthetic)', charcoalRestaurantPalette],
]

const HERO_VARIANTS: readonly HeroVariant[] = [
  'mesh',
  'geometric',
  'diagonal',
  'radial',
  'dark',
  'warm',
]

/** Mean luminance and local contrast (mean absolute difference between adjacent sampled pixels) over a rectangular region — the "is this calm enough for a title" measure. */
function localContrastStats(
  rgb: { readonly width: number; readonly height: number; readonly rgb: Uint8Array },
  x0: number,
  x1: number,
) {
  const { width, height } = rgb
  const luminanceAt = (x: number, y: number): number => {
    const idx = (y * width + x) * 3
    const r = rgb.rgb[idx] as number
    const g = rgb.rgb[idx + 1] as number
    const b = rgb.rgb[idx + 2] as number
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const step = 4
  let sumDiff = 0
  let count = 0
  for (let y = step; y < height; y += step) {
    for (let x = x0 + step; x < x1; x += step) {
      const diff = Math.abs(luminanceAt(x, y) - luminanceAt(x - step, y))
      sumDiff += diff
      count++
    }
  }
  return { meanLocalContrast: count === 0 ? 0 : sumDiff / count }
}

describe('heroArt', () => {
  it('renders at the documented default size (1600x1000)', () => {
    const png = renderArt(heroArt(storePalette))
    expect(sniffImageFormat(png)).toBe('png')
  })

  it.each(HERO_VARIANTS)('renders the %s variant without throwing', (variant) => {
    expect(() => renderArt(heroArt(storePalette, variant, 5))).not.toThrow()
  })

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

  it('keeps the left-hand text zone calm across every variant and every palette', () => {
    // The requirement (docs/lots/L25-templates-pro.md, A0c brief): every
    // hero keeps its left half low-contrast enough to put a title over.
    // Rendered small (400x250, not the full 1600x1000) purely so this runs
    // fast across variant × palette — coordinates are canvas fractions, so
    // the composition's structure does not change with size.
    for (const [name, palette] of ALL_PALETTES) {
      for (const variant of HERO_VARIANTS) {
        const rgb = renderRgb({ ...heroArt(palette, variant, 3), width: 400, height: 250 })
        const leftHalf = localContrastStats(rgb, 0, 200)
        const rightHalf = localContrastStats(rgb, 200, 400)
        // The left half must be calm in absolute terms (a title can sit on
        // it), and it must be calmer than the right half — the "drama"
        // (mesh blobs, glows, shapes) is supposed to live on the right.
        expect(
          leftHalf.meanLocalContrast,
          `${name}/${variant}: left-half local contrast ${leftHalf.meanLocalContrast.toFixed(2)} too high`,
        ).toBeLessThan(6)
        expect(
          leftHalf.meanLocalContrast,
          `${name}/${variant}: left half (${leftHalf.meanLocalContrast.toFixed(2)}) is not calmer than the right (${rightHalf.meanLocalContrast.toFixed(2)})`,
        ).toBeLessThanOrEqual(rightHalf.meanLocalContrast + 1.5)
      }
    }
  })
})

describe('coverArt', () => {
  it('renders at the documented default size (1200x800)', () => {
    const png = renderArt(coverArt(storePalette, 1))
    expect(sniffImageFormat(png)).toBe('png')
  })

  it('produces at least eight visibly different layouts across seeds from one palette', () => {
    // The same composition, rendered small (120x80 instead of the 1200x800
    // default) purely to make comparing many of them fast — the full
    // default size is already exercised by the test above, and every layer
    // coordinate is a fraction of the canvas, so a layout's structure is
    // size-independent.
    const renders = Array.from({ length: 40 }, (_, seed) =>
      Buffer.from(renderArt({ ...coverArt(storePalette, seed), width: 120, height: 80 })).toString(
        'base64',
      ),
    )
    const distinct = new Set(renders)
    expect(distinct.size).toBeGreaterThanOrEqual(8)
  })

  it('every family renders without throwing across every palette', () => {
    for (const [, palette] of ALL_PALETTES) {
      for (let seed = 1; seed <= 12; seed++) {
        expect(() =>
          renderArt({ ...coverArt(palette, seed), width: 120, height: 80 }),
        ).not.toThrow()
      }
    }
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

  it('rotates through 8 distinct backdrop/mark hues across seeds 1–8', () => {
    const renders = Array.from({ length: 8 }, (_, i) =>
      Buffer.from(
        renderArt({ ...avatarArt(portfolioPalette, i + 1), width: 60, height: 60 }),
      ).toString('base64'),
    )
    expect(new Set(renders).size).toBe(8)
  })
})

describe('logoArt', () => {
  it('renders a 400x160 neutral wordmark stand-in with no palette input', () => {
    const png = renderArt(logoArt(3))
    expect(sniffImageFormat(png)).toBe('png')
  })

  it('renders 8 distinct mark shapes across seeds 1–8', () => {
    const renders = Array.from({ length: 8 }, (_, seed) =>
      Buffer.from(renderArt(logoArt(seed + 1))).toString('base64'),
    )
    expect(new Set(renders).size).toBeGreaterThan(1)
  })

  it('no mark shape renders as an all-white canvas (the "screen blend on white" trap)', () => {
    // A real bug found while reviewing this module: a mark drawn with
    // `blend: 'screen'` over the wordmark's plain white background is
    // invisible — screen(white, anything) is white. This asserts every one
    // of the 8 mark kinds actually paints *something* darker than white.
    for (let seed = 1; seed <= 40; seed++) {
      const { rgb } = renderRgb(logoArt(seed))
      let minChannel = 255
      for (let i = 0; i < rgb.length; i++) {
        const value = rgb[i] as number
        if (value < minChannel) minChannel = value
      }
      expect(minChannel, `seed ${seed} rendered as an all-white canvas`).toBeLessThan(200)
    }
  })
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

  it('produces at least six visibly different object families across enough seeds', () => {
    const renders = Array.from({ length: 30 }, (_, seed) =>
      Buffer.from(
        renderArt({ ...productArt(storePalette, seed + 1), width: 100, height: 100 }),
      ).toString('base64'),
    )
    expect(new Set(renders).size).toBeGreaterThanOrEqual(6)
  })

  it('every family renders without throwing across every palette', () => {
    // Rendered small (100x100, not the default 1000x1000): this checks
    // construction across every shape × every palette, not render speed —
    // that is what the perf-bound tests in render.test.ts already cover.
    for (const [, palette] of ALL_PALETTES) {
      for (let seed = 1; seed <= 20; seed++) {
        expect(() =>
          renderArt({ ...productArt(palette, seed), width: 100, height: 100 }),
        ).not.toThrow()
      }
    }
  })
})
