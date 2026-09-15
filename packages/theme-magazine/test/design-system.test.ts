import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is the layer every block
 * inherits from, and it is written entirely as functions of contract D's
 * closed token set. A misspelt skin variable (the theme silently loses that
 * colour) and a derived colour that fails contrast (every value is a
 * `color-mix` or a relative `oklch()`) both pass a snapshot, so this file
 * resolves the real stylesheet against the real default skin and computes the
 * answers, in both schemes.
 */

const STYLE_DIR = new URL('../src/styles/', import.meta.url)
const SHEETS = [
  'tokens.css',
  'base.css',
  'stories.css',
  'article.css',
  'blocks.css',
  'archive.css',
  'widgets.css',
] as const

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
 * the theme invents on top of it, every one of them used for text.
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
  ['--cg-accent-fg', '--cg-accent-hover'],
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

    it('keeps a hairline visible and quieter than the heavy rule', () => {
      const hairline = contrast(color('--cg-line', scheme), color('--cg-canvas', scheme))
      const heavy = contrast(color('--cg-line-ink', scheme), color('--cg-canvas', scheme))
      expect(hairline).toBeGreaterThan(1.2)
      expect(hairline).toBeLessThan(heavy)
    })

    it('keeps a link underline visible without competing with the words', () => {
      const underline = contrast(color('--cg-accent-line', scheme), color('--cg-canvas', scheme))
      const words = contrast(color('--cg-accent', scheme), color('--cg-canvas', scheme))
      expect(underline).toBeGreaterThan(1.5)
      expect(underline).toBeLessThan(words)
    })
  })
}

describe('the dark palette is designed, not inverted', () => {
  const lightness = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).l
  const chroma = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).c
  const hue = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).h

  it('lifts the red by more than a mechanical brightening would, and keeps it red', () => {
    expect(lightness('--cg-accent', 'dark')).toBeGreaterThan(
      lightness('--cg-accent', 'light') + 0.15,
    )
    expect(Math.abs(hue('--cg-accent', 'dark') - hue('--cg-accent', 'light'))).toBeLessThan(15)
    expect(chroma('--cg-accent', 'dark')).toBeGreaterThan(0.1)
  })

  it('desaturates the lifted red rather than just brightening it', () => {
    expect(chroma('--cg-accent', 'dark')).toBeLessThan(chroma('--cg-accent', 'light'))
  })

  it('flips the red foreground to ink, because the red it sits on is now light', () => {
    expect(lightness('--cg-accent-fg', 'dark')).toBeLessThan(0.3)
    expect(lightness('--cg-accent-fg', 'light')).toBeGreaterThan(0.7)
  })

  it('expresses elevation as a lightness step: sunken, then canvas, then raised', () => {
    expect(lightness('--cg-canvas', 'dark')).toBeGreaterThan(
      lightness('--cg-surface-sunken', 'dark'),
    )
    expect(lightness('--cg-surface-raised', 'dark')).toBeGreaterThan(
      lightness('--cg-canvas', 'dark'),
    )
  })

  it('keeps the light page flat and white: raised surfaces are the paper itself, depth is a rule', () => {
    expect(lightness('--cg-canvas', 'light')).toBeCloseTo(lightness('--cg-surface-raised', 'light'))
    expect(lightness('--cg-canvas', 'light')).toBeGreaterThan(0.99)
    expect(ALL_CSS).not.toMatch(/--cogenta-shadow-/)
  })

  it('draws a rule as a step up in lightness on ink, and a step down on paper', () => {
    expect(lightness('--cg-line', 'dark')).toBeGreaterThan(lightness('--cg-surface', 'dark'))
    expect(lightness('--cg-line', 'light')).toBeLessThan(lightness('--cg-surface', 'light'))
  })

  it('sets off-white text on an ink ground, never pure white on pure black', () => {
    expect(lightness('--cg-ink', 'dark')).toBeLessThan(0.97)
    expect(lightness('--cg-ink', 'dark')).toBeGreaterThan(0.85)
    expect(lightness('--cg-canvas', 'dark')).toBeGreaterThan(0.12)
    expect(lightness('--cg-canvas', 'dark')).toBeLessThan(0.25)
  })

  it('dims photographs on ink with a brightness step, never a blur', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/\[data-theme="dark"\]\)\s*\{\s*--cg-image-brightness:\s*0\.88/)
    expect(SOURCES.get('base.css')).toMatch(/filter:\s*brightness\(var\(--cg-image-brightness\)\)/)
  })
})

/**
 * The studio charter (`docs/lots/L27`): motion is a colour or an underline
 * changing, nothing lifts, nothing fades in on scroll, and a photograph never
 * casts a shadow. Checked on the real stylesheets, comments stripped.
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
    expect(hoverRules.length).toBeGreaterThan(10)
    for (const body of hoverRules) {
      expect(body).not.toMatch(/transform|translate|box-shadow|scale|rotate/)
    }
  })

  it('declares no keyframes, no entrance animation and no scroll-driven animation', () => {
    expect(CODE).not.toMatch(
      /@keyframes|animation\s*:|animation-name|animation-timeline|view-timeline|scroll-timeline/,
    )
  })

  it('casts no shadow at all, on a photograph or anywhere else', () => {
    expect(CODE.replace(/box-shadow:\s*inset[^;]*;/g, '')).not.toMatch(/box-shadow|drop-shadow/)
  })

  it('keeps corners square: no pill and no large radius anywhere', () => {
    const radii = [...CODE.matchAll(/border-radius:\s*([^;]+);/g)].map((m) =>
      (m[1] as string).trim(),
    )
    expect(radii.length).toBeGreaterThan(3)
    for (const value of radii) {
      expect(['var(--cg-radius)', 'var(--cg-radius-control)', '0', '50%']).toContain(value)
    }
  })

  it('draws a column rule as a one-pixel line, never as a coloured box around a story', () => {
    expect(CODE).not.toMatch(/\.cg-story\s*\{[^}]*(background|border:)/)
    expect(CODE).toMatch(/inline-size: var\(--cg-rule\);\s*background: var\(--cg-line\);/)
  })

  it('draws every arrow link as inline content, so its words carry one continuous underline', () => {
    const rule = CODE.match(
      /\.cg-action\[data-emphasis="secondary"\],\s*\.cg-arrow-link\s*\{([^}]*)\}/,
    )?.[1]
    expect(rule).toBeDefined()
    expect(rule).toMatch(/display:\s*inline-block/)
    expect(rule).not.toMatch(/display:\s*(inline-)?flex/)
    expect(CODE).toMatch(
      /\.cg-arrow-link::after\s*\{\s*content:\s*"\\2192" \/ "";\s*display:\s*inline-block/,
    )
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

  it('swaps the light and dark toggle icons in both directions', () => {
    expect(CODE).toMatch(
      /\[data-theme="dark"\]\)\s*\.cg-theme-toggle__icon--sun\s*\{\s*display:\s*none/,
    )
    expect(CODE).toMatch(
      /prefers-color-scheme: dark\)[\s\S]*\.cg-theme-toggle__icon--moon\s*\{\s*display:\s*block/,
    )
  })
})

describe('the newspaper typography', () => {
  it('holds the reading measure between 60 and 75 characters', () => {
    const measure = Number(CG.get('--cg-measure')?.replace('ch', ''))
    expect(measure).toBeGreaterThanOrEqual(60)
    expect(measure).toBeLessThanOrEqual(75)
  })

  it('announces in the display face, reads in the text face and scans in the interface face', () => {
    expect(CG.get('--cg-font-display')).toBe('var(--cogenta-font-serif)')
    expect(CG.get('--cg-font-text')).toBe('"Source Serif 4", var(--cogenta-font-serif)')
    expect(CG.get('--cg-font-ui')).toBe('var(--cogenta-font-sans)')
    expect(CODE).toMatch(/body\s*\{[^}]*font-family:\s*var\(--cg-font-text\)/)
    expect(CODE).toMatch(
      /:where\(h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-family:\s*var\(--cg-font-display\)/,
    )
    expect(CODE).toMatch(/\.cg-story__kicker\s*\{[^}]*font-family:\s*var\(--cg-font-ui\)/)
    expect(CODE).toMatch(/\.cg-masthead\s*\{[^}]*font-family:\s*var\(--cg-font-ui\)/)
  })

  it('sets kickers in spaced capitals in the one red', () => {
    const kicker = CODE.match(/\.cg-story__kicker\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(kicker).toMatch(/color:\s*var\(--cg-accent\)/)
    expect(kicker).toMatch(/text-transform:\s*uppercase/)
    expect(kicker).toMatch(/letter-spacing:\s*var\(--cg-tracking-caps\)/)
  })

  it('balances headings and wraps paragraphs without orphans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*text-wrap:\s*balance/)
    expect(CODE).toMatch(/p, li, dd, figcaption, blockquote\)\s*\{[^}]*text-wrap:\s*pretty/)
  })

  it('hangs punctuation where the browser supports it', () => {
    expect(CODE).toMatch(/hanging-punctuation:\s*first/)
  })

  it('sets figures in tabular lining numerals wherever numbers are compared', () => {
    for (const selector of [
      '.cg-figures__value {',
      '.cg-rates__amount {',
      '.cg-tally__value {',
      '.cg-story__numeral {',
      '.cg-masthead__date {',
    ]) {
      const at = CODE.indexOf(selector)
      expect(at, selector).toBeGreaterThan(-1)
      expect(CODE.slice(at, CODE.indexOf('}', at)), selector).toMatch(/tabular-nums/)
    }
  })

  it('tightens the tracking of the display sizes, without letting letters touch', () => {
    const tracking = Number.parseFloat(CG.get('--cg-tracking-display') ?? '0')
    expect(tracking).toBeLessThan(0)
    expect(tracking).toBeGreaterThan(-0.02)
  })

  it('sets a drop cap only with a true initial letter, two lines deep', () => {
    expect(CODE).toMatch(/@supports \(initial-letter: 2\)/)
    expect(CODE).toMatch(
      /\[data-opening\] \.cg-prose__body > p:first-child::first-letter\s*\{[^}]*initial-letter:\s*2/,
    )
    expect(CODE).not.toMatch(/::first-letter\s*\{[^}]*float/)
  })

  it('never styles a photograph with anything but its crop and a brightness step', () => {
    const imageRules = [...CODE.matchAll(/__image[^{]*\{([^}]*)\}/g)].map((m) => m[1] as string)
    expect(imageRules.length).toBeGreaterThan(5)
    for (const body of imageRules) expect(body).not.toMatch(/shadow|blur|opacity|transform/)
  })
})
