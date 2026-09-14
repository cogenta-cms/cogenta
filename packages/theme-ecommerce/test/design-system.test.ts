import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is written entirely as
 * functions of contract D's closed token set. A misspelt skin variable and a
 * derived colour that fails contrast both pass a snapshot, so this file
 * resolves the real stylesheet against the real default skin and computes
 * the answers, in both schemes; then it holds the studio charter
 * (`docs/lots/L27`) against the stylesheets themselves.
 */

const STYLE_DIR = new URL('../src/styles/', import.meta.url)
const SHEETS = ['tokens.css', 'base.css', 'shop.css', 'blocks.css', 'archive.css'] as const

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
  ...Object.entries(skin).flatMap(([group, values]) =>
    Object.keys(values).map((name) => `--cogenta-${group}-${kebab(name)}`),
  ),
  '--cogenta-space-scale',
  ...TYPE_SCALE_STEPS.map((step) => `--cogenta-font-size-${step}`),
])

function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/(--ce-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1] as string
    const value = (match[2] as string).replace(/\s+/g, ' ').trim()
    if (!found.has(name) || value.includes('light-dark(')) found.set(name, value)
  }
  return found
}

const CE = declarations((SOURCES.get('tokens.css') as string).replace(/\/\*[\s\S]*?\*\//g, ''))

const VARIABLES = new Map<string, string>([
  ...[...CE].map(([name, value]) => [name, value] as const),
  ...Object.entries(skin.color ?? {}).map(
    ([name, value]) => [`--cogenta-color-${kebab(name)}`, String(value)] as const,
  ),
])

function color(property: string, scheme: Scheme): Srgb {
  const declared = CE.get(property)
  expect(declared, `${property} must be declared in tokens.css`).toBeDefined()
  return evaluate(declared as string, { scheme, variables: VARIABLES })
}

function rule(selector: string): string {
  const at = CODE.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThan(-1)
  return CODE.slice(at, CODE.indexOf('}', at))
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
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--ce-[a-z0-9-]+)\s*(,?)/g)]
      .filter((match) => match[2] === '')
      .map((match) => match[1] as string)
    const missing = [...new Set(referenced)].filter((name) => !CE.has(name))
    expect(missing).toEqual([])
  })
})

/**
 * Contract D validates three pairs on the skin itself. These are the pairs
 * the theme invents on top of it, every one of them used for text.
 */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--ce-ink', '--ce-canvas'],
  ['--ce-ink', '--ce-surface-sunken'],
  ['--ce-ink', '--ce-plate'],
  ['--ce-ink-muted', '--ce-canvas'],
  ['--ce-ink-muted', '--ce-surface-sunken'],
  ['--ce-ink-subtle', '--ce-canvas'],
  ['--ce-ink-subtle', '--ce-surface-sunken'],
  ['--ce-action-fg', '--ce-action'],
  ['--ce-action-hover-fg', '--ce-action-hover'],
  ['--ce-signal-fg', '--ce-signal'],
  ['--ce-line-ink', '--ce-canvas'],
]

for (const scheme of ['light', 'dark'] as const) {
  describe(`the ${scheme} palette`, () => {
    for (const [foreground, background] of TEXT_PAIRS) {
      it(`reaches AA body contrast for ${foreground} on ${background}`, () => {
        const ratio = contrast(color(foreground, scheme), color(background, scheme))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('holds the signal as a graphic against the page, at least 3:1', () => {
      expect(
        contrast(color('--ce-signal', scheme), color('--ce-canvas', scheme)),
      ).toBeGreaterThanOrEqual(3)
    })

    it('draws a strong line that separates from the ground, and a hairline that stays quieter', () => {
      const strong = contrast(color('--ce-line-strong', scheme), color('--ce-canvas', scheme))
      const hairline = contrast(color('--ce-line', scheme), color('--ce-canvas', scheme))
      expect(strong).toBeGreaterThanOrEqual(2.2)
      expect(hairline).toBeGreaterThan(1.15)
      expect(hairline).toBeLessThan(strong)
    })

    it('sets the stone band apart from the page, gently', () => {
      const ratio = contrast(color('--ce-surface-sunken', scheme), color('--ce-canvas', scheme))
      expect(ratio).toBeGreaterThan(1.05)
      expect(ratio).toBeLessThan(1.5)
    })
  })
}

describe('the dark palette is designed, not inverted', () => {
  const oklch = (property: string, scheme: Scheme) => toOklch(color(property, scheme))

  it('grounds the page in a deep warm brown-black, never pure black', () => {
    const { l, c, h } = oklch('--ce-canvas', 'dark')
    expect(l).toBeGreaterThan(0.15)
    expect(l).toBeLessThan(0.24)
    expect(c).toBeGreaterThan(0.004)
    expect(h).toBeGreaterThan(20)
    expect(h).toBeLessThan(90)
  })

  it('sets type in the paper’s own sand, a step below white', () => {
    const { l } = oklch('--ce-ink', 'dark')
    expect(l).toBeGreaterThan(0.88)
    expect(l).toBeLessThan(0.97)
  })

  it('lifts the terracotta for the dark ground, keeping its hue', () => {
    expect(oklch('--ce-signal', 'dark').l).toBeGreaterThan(oklch('--ce-signal', 'light').l + 0.1)
    expect(Math.abs(oklch('--ce-signal', 'dark').h - oklch('--ce-signal', 'light').h)).toBeLessThan(
      3,
    )
  })

  it('expresses depth as a lightness step up from the ground: canvas, band, plate', () => {
    expect(oklch('--ce-surface-sunken', 'dark').l).toBeGreaterThan(oklch('--ce-canvas', 'dark').l)
    expect(oklch('--ce-plate', 'dark').l).toBeGreaterThan(oklch('--ce-surface-sunken', 'dark').l)
  })

  it('draws a rule as a step up in lightness in the dark, and a step down on paper', () => {
    expect(oklch('--ce-line', 'dark').l).toBeGreaterThan(oklch('--ce-canvas', 'dark').l)
    expect(oklch('--ce-line', 'light').l).toBeLessThan(oklch('--ce-canvas', 'light').l)
  })

  it('flips the filled action to sand with dark words', () => {
    expect(oklch('--ce-action', 'dark').l).toBeGreaterThan(0.85)
    expect(oklch('--ce-action-fg', 'dark').l).toBeLessThan(0.25)
  })

  it('keeps a pale plate behind marks in the dark, so a wordmark drawn for paper stays legible', () => {
    expect(oklch('--ce-mark-plate', 'dark').l).toBeGreaterThan(0.85)
  })

  it('dims photographs in the dark with a brightness step, never a blur', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/\[data-theme="dark"\]\)\s*\{\s*--ce-image-brightness:\s*0\.9/)
    expect(SOURCES.get('base.css')).toMatch(/filter:\s*brightness\(var\(--ce-image-brightness\)\)/)
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
    for (const property of ['--ce-canvas', '--ce-ink', '--ce-signal', '--ce-plate']) {
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

describe('the motion, depth and colour rules of the charter', () => {
  it('caps every transition at 150 ms through the one duration token', () => {
    expect(CE.get('--ce-duration')).toMatch(/min\(var\(--cogenta-motion-duration\), 150ms\)/)
    const literal = [...CODE.matchAll(/transition[^;]*?(\d+(?:\.\d+)?)(ms|s)\b/g)].map((match) =>
      match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]),
    )
    expect(literal.every((ms) => ms <= 150)).toBe(true)
  })

  it('removes every transition under prefers-reduced-motion, through the same token', () => {
    expect(CODE).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--ce-duration:\s*0ms;/,
    )
    const transitions = [...CODE.matchAll(/transition\s*:([^;]*);/g)].map((m) => m[1] as string)
    expect(transitions.length).toBeGreaterThan(3)
    for (const value of transitions) expect(value).toContain('var(--ce-duration)')
  })

  it('transitions nothing but colours and underlines', () => {
    const transitions = [...CODE.matchAll(/transition\s*:([^;]*);/g)].map((m) => m[1] as string)
    for (const value of transitions) {
      const properties = value.split(',').map((part) => part.trim().split(/\s+/)[0])
      for (const property of properties) {
        expect(['color', 'background-color', 'border-color', 'text-decoration-color']).toContain(
          property,
        )
      }
    }
  })

  it('never moves, scales or shadows an element on hover', () => {
    const hoverRules = [...CODE.matchAll(/:hover[^{]*\{([^}]*)\}/g)].map((m) => m[1] as string)
    expect(hoverRules.length).toBeGreaterThan(8)
    for (const body of hoverRules) {
      expect(body).not.toMatch(/transform|translate|box-shadow|scale|rotate|margin|inset|opacity/)
    }
  })

  it('declares no keyframes, no entrance animation and no scroll-driven animation', () => {
    expect(CODE).not.toMatch(
      /@keyframes|animation\s*:|animation-name|animation-timeline|view-timeline|scroll-timeline/,
    )
  })

  it('casts no shadow at all, on a photograph or anywhere else', () => {
    expect(CODE.replace(/box-shadow:\s*inset[^;]*;/g, '')).not.toMatch(/box-shadow|drop-shadow/)
    expect(ALL_CSS).not.toMatch(/--cogenta-shadow-/)
  })

  it('draws no gradient, no blur and no frosted glass', () => {
    expect(CODE).not.toMatch(/gradient\(|backdrop-filter|blur\(/)
  })

  it('keeps corners square: no pill, no circle, no radius beyond the skin’s own', () => {
    const radii = [...CODE.matchAll(/border-radius:\s*([^;]+);/g)].map((m) =>
      (m[1] as string).trim(),
    )
    expect(radii.length).toBeGreaterThan(2)
    for (const value of radii) {
      expect(['var(--ce-radius)', 'var(--ce-radius-control)', '0']).toContain(value)
    }
  })

  it('keeps the terracotta to details: a focus ring, a selection, the underline of a link in text', () => {
    const uses = [...CODE.matchAll(/([a-z-]+)\s*:\s*[^;{}]*var\(--ce-signal\)[^;{}]*;/g)].map(
      (match) => match[1] as string,
    )
    expect(uses.length).toBeGreaterThan(0)
    expect(uses.length).toBeLessThanOrEqual(5)
    for (const property of uses) {
      expect(['outline', 'background', 'text-decoration-color']).toContain(property)
    }
    expect(CODE).not.toMatch(/(?:^|[;{\s])color:\s*var\(--ce-signal\)/)
    expect(rule('.ce-prose__body a')).toMatch(/text-decoration-color:\s*var\(--ce-signal\)/)
  })

  it('draws every arrow link as inline content, so its words carry one continuous underline', () => {
    const arrow = CODE.match(
      /\.cg-action\[data-emphasis="secondary"\],\s*\.ce-arrow-link\s*\{([^}]*)\}/,
    )?.[1]
    expect(arrow).toBeDefined()
    expect(arrow).toMatch(/display:\s*inline-block/)
    expect(arrow).not.toMatch(/display:\s*(inline-)?flex/)
    expect(CODE).toMatch(
      /\.ce-arrow-link::after\s*\{\s*content:\s*"\\2192" \/ "";\s*display:\s*inline-block/,
    )
  })

  it('separates with space and hairlines: no box behind a product, no hover state on a card', () => {
    expect(rule('.ce-goods')).not.toMatch(/background|border:/)
    expect(CODE).not.toMatch(/\.ce-goods__item:hover|\.ce-tiles__item:hover/)
    expect(rule('.ce-cta__inner')).not.toMatch(/background/)
  })

  it('never uppercases a label or tracks it out', () => {
    expect(CODE).not.toMatch(/text-transform:\s*uppercase/)
    const tracking = [...CODE.matchAll(/letter-spacing:\s*([^;]+);/g)].map((m) =>
      (m[1] as string).trim(),
    )
    for (const value of tracking) {
      if (value.startsWith('var(')) continue
      expect(Number.parseFloat(value)).toBeLessThanOrEqual(0.02)
    }
    expect(Number.parseFloat(CE.get('--ce-tracking-caption') ?? '1')).toBeLessThanOrEqual(0.02)
  })
})

describe('the typography', () => {
  it('holds the reading measure between 60 and 75 characters', () => {
    const measure = Number(CE.get('--ce-measure')?.replace('ch', ''))
    expect(measure).toBeGreaterThanOrEqual(60)
    expect(measure).toBeLessThanOrEqual(75)
  })

  it('balances headings and wraps paragraphs without orphans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*text-wrap:\s*balance/)
    expect(CODE).toMatch(/p, li, dd, figcaption, blockquote\)\s*\{[^}]*text-wrap:\s*pretty/)
  })

  it('hangs punctuation where the browser supports it, and quotes with real quotation marks', () => {
    expect(CODE).toMatch(/hanging-punctuation:\s*first/)
    expect(rule('.ce-quote__quote')).toMatch(/quotes:\s*"\\201C" "\\201D"/)
  })

  it('sets prices and figures in tabular lining numerals wherever numbers are compared', () => {
    for (const selector of [
      '.ce-goods__price',
      '.ce-product__price',
      '.ce-product__fact-value',
      '.ce-figures__value',
      '.ce-plans__amount',
      '.ce-footer__copyright',
      ':where(data, time)',
    ]) {
      expect(rule(selector), selector).toMatch(/tabular-nums/)
    }
  })

  it('tightens the tracking of the display sizes, without letting letters touch', () => {
    const tracking = Number.parseFloat(CE.get('--ce-tracking-display') ?? '0')
    expect(tracking).toBeLessThan(0)
    expect(tracking).toBeGreaterThan(-0.03)
  })

  it('sets the headline light and large, and a price at the regular weight', () => {
    expect(rule('.ce-hero__title')).toMatch(/font-weight:\s*var\(--ce-weight-light\)/)
    expect(rule('.ce-product__price')).toMatch(/font-weight:\s*var\(--ce-weight-regular\)/)
  })

  it('styles a photograph with nothing but its crop and a brightness step', () => {
    const imageRules = [...CODE.matchAll(/__image[^{,]*\{([^}]*)\}/g)].map((m) => m[1] as string)
    expect(imageRules.length).toBeGreaterThan(5)
    for (const body of imageRules) expect(body).not.toMatch(/shadow|blur|opacity|transform|radius/)
  })
})

describe('the grid and the goods', () => {
  it('lays every block on twelve columns with constant gutters and an explicit page width', () => {
    expect(CE.get('--ce-columns')).toBe('12')
    expect(CE.get('--ce-page')).toMatch(/rem$/)
    expect(rule('.ce-container')).toMatch(
      /grid-template-columns:\s*repeat\(var\(--ce-columns\), minmax\(0, 1fr\)\)/,
    )
  })

  it('spaces every block with the one section rhythm', () => {
    expect(rule('.ce-section')).toMatch(/padding-block:\s*calc\(var\(--ce-section\) \/ 2\)/)
  })

  it('shows the goods four across on a wide screen and two on a phone', () => {
    const shop = SOURCES.get('shop.css') as string
    expect(rule('.ce-goods')).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
    expect(shop).toMatch(
      /min-width: 64rem\)\s*\{\s*\.ce-goods\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
    )
  })

  it('crops every product photograph to 4:5 on the stone plate, and every category tile to a square', () => {
    expect(rule('.ce-goods__media')).toMatch(/aspect-ratio:\s*4 \/ 5/)
    expect(rule('.ce-goods__media')).toMatch(/background:\s*var\(--ce-plate\)/)
    expect(rule('.ce-goods__image')).toMatch(/object-fit:\s*cover/)
    expect(rule('.ce-tiles__media')).toMatch(/aspect-ratio:\s*1 \/ 1/)
  })

  it('holds the product information in view beside the photograph on a wide screen', () => {
    const shop = SOURCES.get('shop.css') as string
    expect(shop).toMatch(/\.ce-product__media\s*\{\s*grid-column:\s*1 \/ span 7/)
    expect(shop).toMatch(
      /\.ce-product__info\s*\{\s*grid-column:\s*9 \/ span 4;\s*position:\s*sticky/,
    )
  })

  it('keeps the header on the page’s own ground, with a hairline and no shadow', () => {
    expect(rule('.ce-header')).toMatch(/position:\s*sticky/)
    expect(rule('.ce-header')).toMatch(/background:\s*var\(--ce-canvas\)/)
    expect(rule('.ce-header')).toMatch(
      /border-block-end:\s*var\(--ce-rule\) solid var\(--ce-line\)/,
    )
  })

  it('opens the mobile menu with the checkbox alone, no script', () => {
    expect(CODE).toMatch(/\.ce-nav-toggle-input:checked ~ \.ce-header__nav\s*\{\s*display:\s*block/)
  })
})
