import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is the layer every block
 * inherits from, and it is written entirely as functions of contract D's
 * closed token set. Two things can go wrong there and neither shows up in a
 * snapshot:
 *
 * 1. **A misspelt skin variable.** `renderSkin` kebab-cases token names, so
 *    a camelCase reference resolves to nothing and the theme silently loses
 *    that colour.
 * 2. **A derived colour that fails contrast.** Every value here is a
 *    `color-mix` or a relative `oklch()`, so no one can read the file and
 *    know the ratio by eye.
 *
 * So this file resolves the real stylesheet against the real default skin
 * and computes the answers, in both schemes.
 */

const STYLE_DIR = new URL('../src/styles/', import.meta.url)
const SHEETS = ['tokens.css', 'base.css', 'blocks.css'] as const

const SOURCES = new Map(
  SHEETS.map((name) => [name, readFileSync(new URL(name, STYLE_DIR), 'utf8')] as const),
)
const ALL_CSS = [...SOURCES.values()].join('\n')

const skin = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8')) as Record<
  string,
  Record<string, string | number | boolean>
>

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

const TYPE_SCALE_STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const

const EMITTED_SKIN_PROPERTIES: ReadonlySet<string> = new Set([
  ...Object.entries(skin).flatMap(([group, tokens]) =>
    Object.keys(tokens).map((name) => `--cogenta-${group}-${kebab(name)}`),
  ),
  '--cogenta-space-scale',
  ...TYPE_SCALE_STEPS.map((step) => `--cogenta-font-size-${step}`),
])

function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/(--cg-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1] as string, (match[2] as string).replace(/\s+/g, ' ').trim())
  }
  return found
}

const CG = declarations(SOURCES.get('tokens.css') as string)

const VARIABLES = new Map<string, string>([
  ...[...CG].map(([name, value]) => [name, value] as const),
  ...Object.entries(skin.color ?? {}).map(
    ([name, value]) => [`--cogenta-color-${kebab(name)}`, String(value)] as const,
  ),
])

function color(property: string, scheme: Scheme): Srgb {
  const declared = CG.get(property)
  expect(declared, `${property} must be declared in tokens.css`).toBeDefined()
  return evaluate(declared as string, { scheme, variables: VARIABLES })
}

describe('the design system references only properties the skin emits', () => {
  it('never misspells a skin token', () => {
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--cogenta-[a-zA-Z0-9-]+)/g)].map(
      (match) => match[1] as string,
    )
    expect(referenced.length).toBeGreaterThan(10)
    const unknown = [...new Set(referenced)].filter((name) => !EMITTED_SKIN_PROPERTIES.has(name))
    expect(unknown).toEqual([])
  })

  it('reads the whole typographic scale rather than deriving a second one', () => {
    const steps = [...ALL_CSS.matchAll(/var\(\s*--cogenta-font-size-([a-z0-9]+)/g)].map(
      (match) => match[1] as string,
    )
    expect([...new Set(steps)].sort()).toEqual([...TYPE_SCALE_STEPS].sort())
  })

  it('declares every derived property it uses without a fallback', () => {
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--cg-[a-z0-9-]+)\s*(,?)/g)]
      .filter((match) => match[2] === '')
      .map((match) => match[1] as string)
    const missing = [...new Set(referenced)].filter((name) => !CG.has(name))
    expect(missing).toEqual([])
  })
})

/**
 * Contract D validates three pairs on the skin itself. These are the pairs
 * the *theme* invents on top of it.
 */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--cg-ink', '--cg-canvas'],
  ['--cg-ink', '--cg-surface'],
  ['--cg-ink', '--cg-surface-raised'],
  ['--cg-ink', '--cg-surface-sunken'],
  ['--cg-ink-muted', '--cg-canvas'],
  ['--cg-ink-muted', '--cg-surface-sunken'],
  ['--cg-ink-muted', '--cg-surface-raised'],
  ['--cg-ink-subtle', '--cg-canvas'],
  ['--cg-ink-subtle', '--cg-surface-sunken'],
  ['--cg-accent-fg', '--cg-accent'],
  ['--cg-accent-fg', '--cg-accent-hover'],
  ['--cg-accent-soft-fg', '--cg-accent-soft'],
  ['--cg-accent', '--cg-canvas'],
  ['--cg-accent', '--cg-surface-sunken'],
]

for (const scheme of ['light', 'dark'] as const) {
  describe(`the ${scheme} palette`, () => {
    for (const [foreground, background] of TEXT_PAIRS) {
      it(`reaches AA body contrast for ${foreground} on ${background}`, () => {
        const ratio = contrast(color(foreground, scheme), color(background, scheme))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('separates a line from the surface it sits on', () => {
      const ratio = contrast(color('--cg-line-strong', scheme), color('--cg-surface', scheme))
      expect(ratio).toBeGreaterThanOrEqual(3)
    })
  })
}

/**
 * This theme's own claim is "designed, not inverted" — checked as a claim
 * about *values*, each one something a mechanical swap of `bg` and `fg`
 * would fail.
 */
describe('the dark palette is designed, not inverted', () => {
  const lightness = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).l

  it('lifts the accent by more than a mechanical brightening would', () => {
    expect(lightness('--cg-accent', 'dark')).toBeGreaterThan(
      lightness('--cg-accent', 'light') + 0.1,
    )
  })

  it('flips the accent foreground to ink, because the accent it sits on is now light', () => {
    expect(lightness('--cg-accent-fg', 'dark')).toBeLessThan(0.3)
    expect(lightness('--cg-accent-fg', 'light')).toBeGreaterThan(0.7)
  })

  it('expresses elevation as a lightness step — sunken, then canvas, then raised', () => {
    const sunken = lightness('--cg-surface-sunken', 'dark')
    const canvas = lightness('--cg-canvas', 'dark')
    const raised = lightness('--cg-surface-raised', 'dark')
    expect(canvas).toBeGreaterThan(sunken)
    expect(raised).toBeGreaterThan(canvas)
  })

  it('keeps canvas and surface flush in both schemes — depth is a border here, not a lightness step', () => {
    expect(lightness('--cg-surface', 'dark')).toBeCloseTo(lightness('--cg-canvas', 'dark'), 3)
    expect(lightness('--cg-surface', 'light')).toBeCloseTo(lightness('--cg-canvas', 'light'), 3)
  })

  it('inverts nothing in light mode, where elevation is a shadow instead', () => {
    expect(lightness('--cg-canvas', 'light')).toBeCloseTo(lightness('--cg-surface-raised', 'light'))
    expect(CG.get('--cg-elevation-2')).toContain('--cg')
  })

  it('draws a border as a step up in lightness in dark, and a step down in light', () => {
    expect(lightness('--cg-line', 'dark')).toBeGreaterThan(lightness('--cg-surface', 'dark'))
    expect(lightness('--cg-line', 'light')).toBeLessThan(lightness('--cg-surface', 'light'))
  })

  it('keeps text off pure white, and the canvas off pure black', () => {
    expect(lightness('--cg-ink', 'dark')).toBeLessThan(0.98)
    expect(lightness('--cg-ink', 'dark')).toBeGreaterThan(0.85)
    expect(lightness('--cg-canvas', 'dark')).toBeGreaterThan(0.1)
    expect(lightness('--cg-canvas', 'dark')).toBeLessThan(0.3)
  })

  it('desaturates the lifted accent rather than just brightening it', () => {
    const chroma = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).c
    expect(chroma('--cg-accent', 'dark')).toBeLessThan(chroma('--cg-accent', 'light'))
  })
})

describe('the scheme switch', () => {
  const tokens = SOURCES.get('tokens.css') as string

  it('declares a colour scheme, so native controls follow the palette', () => {
    expect(tokens).toMatch(/color-scheme:\s*light dark/)
  })

  it('lets a site override the OS preference in both directions', () => {
    expect(tokens).toMatch(/\[data-theme="dark"\][^{]*\{[^}]*color-scheme:\s*dark/)
    expect(tokens).toMatch(/\[data-theme="light"\][^{]*\{[^}]*color-scheme:\s*light/)
  })

  it('guards the scheme-aware values behind a feature query with a light fallback', () => {
    expect(tokens).toMatch(/@supports \(color: light-dark\(/)
    for (const property of ['--cg-canvas', '--cg-ink', '--cg-accent']) {
      const before = tokens.slice(0, tokens.indexOf('@supports (color:'))
      expect(before, `${property} needs a pre-@supports fallback`).toContain(`${property}:`)
    }
  })
})
