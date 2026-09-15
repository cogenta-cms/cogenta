import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is the layer every block
 * inherits from, and it is written entirely as functions of contract D's
 * closed token set. Two things can go wrong there and neither shows up in a
 * snapshot: a misspelt skin variable (the theme silently loses that colour),
 * and a derived colour that fails contrast (every value is a `color-mix` or
 * a relative `oklch()`, so nobody can read the ratio by eye).
 *
 * So this file resolves the real stylesheet against the real default skin
 * and computes the answers, in both schemes.
 */

const STYLE_DIR = new URL('../src/styles/', import.meta.url)
const SHEETS = ['tokens.css', 'base.css', 'blocks.css', 'archive.css', 'widgets.css'] as const

const SOURCES = new Map(
  SHEETS.map((name) => [name, readFileSync(new URL(name, STYLE_DIR), 'utf8')] as const),
)
const ALL_CSS = [...SOURCES.values()].join('\n')
const CODE = ALL_CSS.replace(/\/\*[\s\S]*?\*\//g, '')

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
    // The first declaration is the one the palette is defined by; later ones
    // are scheme overrides a test reads through `light-dark()` instead.
    const name = match[1] as string
    const value = (match[2] as string).replace(/\s+/g, ' ').trim()
    if (!found.has(name) || value.includes('light-dark(')) found.set(name, value)
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

  it('declares every derived property it uses', () => {
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--cg-[a-z0-9-]+)\s*(,?)/g)]
      .filter((match) => match[2] === '')
      .map((match) => match[1] as string)
    const missing = [...new Set(referenced)].filter((name) => !CG.has(name))
    expect(missing).toEqual([])
  })
})

/**
 * Contract D validates three pairs on the skin itself. These are the pairs
 * the *theme* invents on top of it, every one of them used for text.
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
  ['--cg-accent', '--cg-canvas'],
  ['--cg-accent', '--cg-surface-sunken'],
  ['--cg-accent-hover', '--cg-canvas'],
  ['--cg-accent-fg', '--cg-accent'],
  ['--cg-action-fg', '--cg-action'],
  ['--cg-action-hover-fg', '--cg-action-hover'],
  ['--cg-line-ink', '--cg-canvas'],
]

for (const scheme of ['light', 'dark'] as const) {
  describe(`the ${scheme} palette`, () => {
    for (const [foreground, background] of TEXT_PAIRS) {
      it(`reaches AA body contrast for ${foreground} on ${background}`, () => {
        const ratio = contrast(color(foreground, scheme), color(background, scheme))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('separates a strong line from the surface it sits on', () => {
      const ratio = contrast(color('--cg-line-strong', scheme), color('--cg-surface', scheme))
      expect(ratio).toBeGreaterThanOrEqual(3)
    })

    it('keeps a link underline visible without competing with the words', () => {
      const underline = contrast(color('--cg-accent-line', scheme), color('--cg-canvas', scheme))
      const words = contrast(color('--cg-accent', scheme), color('--cg-canvas', scheme))
      expect(underline).toBeGreaterThan(1.5)
      expect(underline).toBeLessThan(words)
    })
  })
}

/**
 * This theme's own claim is "designed, not inverted", checked as a claim
 * about *values*, each one something a mechanical swap of `bg` and `fg`
 * would fail.
 */
describe('the dark palette is designed, not inverted', () => {
  const lightness = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).l
  const chroma = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).c
  const hue = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).h

  it('lifts the accent by more than a mechanical brightening would', () => {
    expect(lightness('--cg-accent', 'dark')).toBeGreaterThan(
      lightness('--cg-accent', 'light') + 0.2,
    )
  })

  it('flips the accent foreground to ink, because the accent it sits on is now light', () => {
    expect(lightness('--cg-accent-fg', 'dark')).toBeLessThan(0.3)
    expect(lightness('--cg-accent-fg', 'light')).toBeGreaterThan(0.7)
  })

  it('expresses elevation as a lightness step: sunken, then canvas, then raised', () => {
    const sunken = lightness('--cg-surface-sunken', 'dark')
    const canvas = lightness('--cg-canvas', 'dark')
    const raised = lightness('--cg-surface-raised', 'dark')
    expect(canvas).toBeGreaterThan(sunken)
    expect(raised).toBeGreaterThan(canvas)
  })

  it('keeps the light page flat: raised surfaces are the paper itself, depth is a hairline', () => {
    expect(lightness('--cg-canvas', 'light')).toBeCloseTo(lightness('--cg-surface-raised', 'light'))
    expect(ALL_CSS).not.toMatch(/--cogenta-shadow-/)
  })

  it('draws a border as a step up in lightness in dark, and a step down in light', () => {
    expect(lightness('--cg-line', 'dark')).toBeGreaterThan(lightness('--cg-surface', 'dark'))
    expect(lightness('--cg-line', 'light')).toBeLessThan(lightness('--cg-surface', 'light'))
  })

  it('keeps text off pure white, and the canvas off pure black', () => {
    expect(lightness('--cg-ink', 'dark')).toBeLessThan(0.97)
    expect(lightness('--cg-ink', 'dark')).toBeGreaterThan(0.85)
    expect(lightness('--cg-canvas', 'dark')).toBeGreaterThan(0.12)
    expect(lightness('--cg-canvas', 'dark')).toBeLessThan(0.3)
  })

  it('takes the dark ground from the warm ink of the light page, never a neutral grey', () => {
    expect(chroma('--cg-canvas', 'dark')).toBeGreaterThan(0.004)
    expect(Math.abs(hue('--cg-canvas', 'dark') - hue('--cg-ink', 'light'))).toBeLessThan(25)
  })

  it('desaturates the lifted accent rather than just brightening it', () => {
    expect(chroma('--cg-accent', 'dark')).toBeLessThan(chroma('--cg-accent', 'light'))
  })

  it('dims photographs on ink with a brightness step, never a blur', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/\[data-theme="dark"\]\)\s*\{\s*--cg-image-brightness:\s*0\.9/)
    expect(SOURCES.get('base.css')).toMatch(/filter:\s*brightness\(var\(--cg-image-brightness\)\)/)
  })
})

/**
 * The studio charter (`docs/lots/L27`): motion is a colour or an underline
 * changing, nothing lifts, nothing fades in, and a photograph never casts a
 * shadow. Checked on the real stylesheets, comments stripped.
 */
describe('the motion and depth rules', () => {
  it('caps every transition at 150 ms through the one duration token', () => {
    expect(CG.get('--cg-duration')).toMatch(/min\(var\(--cogenta-motion-duration\), 150ms\)/)
    const literal = [...CODE.matchAll(/transition[^;]*?(\d+(?:\.\d+)?)(ms|s)\b/g)].map((match) =>
      match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]),
    )
    expect(literal.every((ms) => ms <= 150)).toBe(true)
  })

  it('removes every transition under prefers-reduced-motion, through the same token', () => {
    expect(CODE).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--cg-duration:\s*0ms;/,
    )
    const transitions = [...CODE.matchAll(/transition\s*:([^;]*);/g)].map((m) => m[1] as string)
    expect(transitions.length).toBeGreaterThan(3)
    for (const value of transitions) expect(value).toContain('var(--cg-duration)')
  })

  it('never moves or scales an element on hover', () => {
    const hoverRules = [...CODE.matchAll(/:hover[^{]*\{([^}]*)\}/g)].map(
      (match) => match[1] as string,
    )
    expect(hoverRules.length).toBeGreaterThan(5)
    for (const body of hoverRules) {
      expect(body).not.toMatch(/transform|translate|box-shadow|scale|rotate/)
    }
  })

  it('declares no keyframes and no entrance animation', () => {
    expect(CODE).not.toMatch(/@keyframes|animation\s*:/)
  })

  it('casts no shadow at all, on a photograph or anywhere else', () => {
    expect(CODE.replace(/box-shadow:\s*inset[^;]*;/g, '')).not.toMatch(/box-shadow|drop-shadow/)
  })

  it('keeps corners barely softened: no pill and no large radius anywhere', () => {
    const radii = [...CODE.matchAll(/border-radius:\s*([^;]+);/g)].map((m) =>
      (m[1] as string).trim(),
    )
    expect(radii.length).toBeGreaterThan(5)
    for (const value of radii) {
      expect(['var(--cg-radius)', 'var(--cg-radius-control)', '0', '50%']).toContain(value)
    }
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
    const before = tokens.slice(0, tokens.indexOf('@supports (color:'))
    for (const property of ['--cg-canvas', '--cg-ink', '--cg-accent']) {
      expect(before, `${property} needs a pre-@supports fallback`).toContain(`${property}:`)
    }
  })
})

/**
 * The reading column is what this theme is for: a measure a book designer
 * would sign, text that wraps well, and figures set as figures.
 */
describe('the reading typography', () => {
  it('holds the reading measure between 60 and 75 characters', () => {
    const measure = Number(CG.get('--cg-measure')?.replace('ch', ''))
    expect(measure).toBeGreaterThanOrEqual(60)
    expect(measure).toBeLessThanOrEqual(75)
  })

  it('balances headings and wraps paragraphs without orphans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*text-wrap:\s*balance/)
    expect(CODE).toMatch(/p, li, dd, figcaption, blockquote\)\s*\{[^}]*text-wrap:\s*pretty/)
  })

  it('hangs punctuation where the browser supports it', () => {
    expect(CODE).toMatch(/hanging-punctuation:\s*first/)
  })

  it('sets figures in tabular lining numerals wherever numbers are compared', () => {
    for (const selector of ['.cg-figures__items', '.cg-tiers__price', '.cg-index__margin {']) {
      const at = CODE.indexOf(selector)
      expect(at, selector).toBeGreaterThan(-1)
      expect(CODE.slice(at, CODE.indexOf('}', at)), selector).toMatch(/tabular-nums/)
    }
  })

  it('uses the text face for what a reader reads and the interface face for what a reader uses', () => {
    expect(CG.get('--cg-font-text')).toBe('var(--cogenta-font-serif)')
    expect(CG.get('--cg-font-ui')).toBe('var(--cogenta-font-sans)')
    expect(CODE).toMatch(/body\s*\{[^}]*font-family:\s*var\(--cg-font-text\)/)
    expect(CODE).toMatch(/\.cg-nav__items\s*\{[^}]*font-family:\s*var\(--cg-font-ui\)/)
  })

  it('tightens the tracking of the display sizes', () => {
    expect(Number.parseFloat(CG.get('--cg-tracking-display') ?? '0')).toBeLessThan(0)
  })
})
