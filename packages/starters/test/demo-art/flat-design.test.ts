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

/**
 * D5 (`docs/lots/L25-templates-pro.md`, 2026-09-05, binding): "zero
 * dégradé... zéro halo/lueur en pseudo-élément... aucun voile en dégradé
 * sur une image... les visuels générés (`demo-art`) sont refaits en
 * compositions plates". `render.ts` keeps `gradient`/`glow`/`vignette` as a
 * *capability* (its own tests exercise them directly) — this file is the
 * gate that nothing in `compositions.ts`'s actual presets ever reaches for
 * one. It also holds the "calm left zone" requirement every hero variant
 * must satisfy so a title reads cleanly over the left ~55% of the frame.
 *
 * There is no `blur` concept anywhere in this renderer at all (no layer
 * kind takes a blur radius, and the one soft join this file allows —
 * `blob`'s `smoothing` — only fuses two hard-edged circles into one
 * organic *silhouette*; the final edge is still the same ~1px
 * `smoothstep` as every other shape), so "no blur" falls out of "no
 * disallowed layer kind" below rather than needing its own check.
 */

const FORBIDDEN_KINDS = new Set(['gradient', 'glow', 'vignette'])
const MAX_GRAIN = 0.015

function paletteOf(blueprintId: string): Palette {
  const skin = STARTING_SKINS[blueprintId]
  if (skin === undefined) {
    throw new Error(`No starting skin for "${blueprintId}" — fix this test fixture.`)
  }
  return skin.color
}

const PALETTES: readonly Palette[] = ['portfolio', 'magazine', 'store'].map(paletteOf)

function assertFlat(layers: readonly ArtLayer[], context: string): void {
  for (const layer of layers) {
    expect(
      FORBIDDEN_KINDS.has(layer.kind),
      `${context}: layer kind "${layer.kind}" is not flat (D5)`,
    ).toBe(false)
    if (layer.kind === 'grain') {
      expect(
        layer.amount,
        `${context}: grain too strong for a flat composition`,
      ).toBeLessThanOrEqual(MAX_GRAIN)
    }
  }
}

const HERO_VARIANTS: readonly HeroVariant[] = [
  'mesh',
  'geometric',
  'diagonal',
  'radial',
  'dark',
  'warm',
  'grid',
  'blocks',
  'bands',
  'rings',
  'ink',
  'sun',
]

describe('D5 — no gradient, glow, or vignette in any generated preset', () => {
  it('heroArt never emits a disallowed layer kind, across every variant, seed, and palette', () => {
    for (const palette of PALETTES) {
      for (const variant of HERO_VARIANTS) {
        for (const seed of [1, 2, 7]) {
          assertFlat(heroArt(palette, variant, seed).layers, `heroArt(${variant}, seed=${seed})`)
        }
      }
    }
  })

  it('coverArt never emits a disallowed layer kind, across many seeds and palettes', () => {
    for (const palette of PALETTES) {
      for (let seed = 0; seed < 30; seed++) {
        assertFlat(coverArt(palette, seed).layers, `coverArt(seed=${seed})`)
      }
    }
  })

  it('avatarArt, logoArt, and productArt never emit a disallowed layer kind', () => {
    for (const palette of PALETTES) {
      for (let seed = 0; seed < 8; seed++) {
        assertFlat(avatarArt(palette, seed).layers, `avatarArt(seed=${seed})`)
        assertFlat(productArt(palette, seed).layers, `productArt(seed=${seed})`)
      }
    }
    for (let seed = 0; seed < 8; seed++) {
      assertFlat(logoArt(seed).layers, `logoArt(seed=${seed})`)
    }
  })
})

/**
 * A layer's horizontal footprint in canvas-x fractions, mirroring exactly
 * the pixel-fraction conventions `render.ts` compiles against (position
 * fractions of width/height, size fractions of the *shorter* side). `null`
 * means "this layer kind has no bounded footprint to check" (a full-canvas
 * fill, or a kind this suite's hero families never use).
 */
function leftFraction(layer: ArtLayer, width: number, height: number): number | null {
  const shorter = Math.min(width, height)
  switch (layer.kind) {
    case 'disc':
    case 'polygon':
    case 'glow':
      return layer.center[0] - (layer.radius * shorter) / width
    case 'ring':
      return layer.center[0] - (layer.outerRadius * shorter) / width
    case 'dots':
      if (layer.center === undefined || layer.width === undefined) return null
      return layer.center[0] - (layer.width * shorter) / 2 / width
    case 'rect':
    case 'checker':
    case 'line': {
      const boxWidth = layer.kind === 'line' ? layer.length : layer.width
      const boxHeight = layer.kind === 'line' ? layer.thickness : layer.height
      const rot = ((layer.rotation ?? 0) * Math.PI) / 180
      const halfW = (boxWidth * shorter) / 2
      const halfH = (boxHeight * shorter) / 2
      const extentPx = halfW * Math.abs(Math.cos(rot)) + halfH * Math.abs(Math.sin(rot))
      return layer.center[0] - extentPx / width
    }
    case 'blob': {
      let min = Number.POSITIVE_INFINITY
      for (const point of layer.points) {
        const edge = point.at[0] - (point.radius * shorter) / width
        if (edge < min) min = edge
      }
      return min
    }
    default:
      return null
  }
}

describe('D5 — every hero variant is a full-canvas flat poster, not a mostly blank frame', () => {
  const HERO_WIDTH = 1600
  const HERO_HEIGHT = 1000

  it('at least one shape in every variant, seed and palette reaches into the left half of the frame', () => {
    // Themes frame the hero's media beside the title, so an image whose left
    // half is a single flat colour renders as an empty picture — the exact
    // regression an earlier "calm left zone" rule produced on every home page.
    for (const palette of PALETTES) {
      for (const variant of HERO_VARIANTS) {
        for (const seed of [1, 2, 3, 9]) {
          const { layers } = heroArt(palette, variant, seed)
          const lefts = layers
            .filter((layer) => layer.kind !== 'fill')
            .map((layer) => leftFraction(layer, HERO_WIDTH, HERO_HEIGHT))
            .filter((left): left is number => left !== null)
          const reaches = layers.some(
            (layer) => layer.kind === 'bands' || layer.kind === 'checker' || layer.kind === 'dots',
          )
          expect(
            reaches || lefts.some((left) => left < 0.5),
            `heroArt(${variant}, seed=${seed}) leaves the left half empty`,
          ).toBe(true)
        }
      }
    }
  })

  it('the first layer of every hero variant is a full-canvas flat colour field', () => {
    // A poster family may open with a solid `fill` or with edge-to-edge
    // `bands` — either way the canvas is covered before any shape is placed.
    for (const palette of PALETTES) {
      for (const variant of HERO_VARIANTS) {
        const { layers } = heroArt(palette, variant, 1)
        expect(['fill', 'bands']).toContain(layers[0]?.kind)
      }
    }
  })
})
