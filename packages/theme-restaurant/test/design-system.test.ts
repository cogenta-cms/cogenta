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
const SHEETS = ['tokens.css', 'base.css', 'menu.css', 'blocks.css', 'archive.css'] as const

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
  for (const match of css.matchAll(/(--cr-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1] as string
    const value = (match[2] as string).replace(/\s+/g, ' ').trim()
    if (!found.has(name) || value.includes('light-dark(')) found.set(name, value)
  }
  return found
}

const CR = declarations((SOURCES.get('tokens.css') as string).replace(/\/\*[\s\S]*?\*\//g, ''))

const VARIABLES = new Map<string, string>([
  ...[...CR].map(([name, value]) => [name, value] as const),
  ...Object.entries(skin.color ?? {}).map(
    ([name, value]) => [`--cogenta-color-${kebab(name)}`, String(value)] as const,
  ),
])

function color(property: string, scheme: Scheme): Srgb {
  const declared = CR.get(property)
  expect(declared, `${property} must be declared in tokens.css`).toBeDefined()
  return evaluate(declared as string, { scheme, variables: VARIABLES })
}

function rule(selector: string): string {
  const at = CODE.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThan(-1)
  return CODE.slice(at, CODE.indexOf('}', at))
}

/** Every rule body whose selector list contains `fragment`. */
function rulesFor(fragment: string): string[] {
  return [...CODE.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => (match[1] as string).includes(fragment))
    .map((match) => match[2] as string)
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
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--cr-[a-z0-9-]+)\s*(,?)/g)]
      .filter((match) => match[2] === '')
      .map((match) => match[1] as string)
    const missing = [...new Set(referenced)].filter((name) => !CR.has(name))
    expect(missing).toEqual([])
  })
})

/**
 * Contract D validates three pairs on the skin itself. These are the pairs
 * the theme invents on top of it, every one of them used for text.
 */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--cr-ink', '--cr-canvas'],
  ['--cr-ink', '--cr-surface'],
  ['--cr-ink', '--cr-plate'],
  ['--cr-ink-muted', '--cr-canvas'],
  ['--cr-ink-muted', '--cr-surface'],
  ['--cr-ink-subtle', '--cr-canvas'],
  ['--cr-ink-subtle', '--cr-surface'],
  ['--cr-brass', '--cr-canvas'],
  ['--cr-brass', '--cr-surface'],
  ['--cr-brass-fg', '--cr-brass'],
  ['--cr-action-fg', '--cr-action'],
  ['--cr-action-hover-fg', '--cr-action-hover'],
  ['--cr-line-ink', '--cr-canvas'],
  ['--cr-footer-ink', '--cr-footer'],
  ['--cr-footer-muted', '--cr-footer'],
]

for (const scheme of ['light', 'dark'] as const) {
  describe(`the ${scheme} palette`, () => {
    for (const [foreground, background] of TEXT_PAIRS) {
      it(`reaches AA body contrast for ${foreground} on ${background}`, () => {
        const ratio = contrast(color(foreground, scheme), color(background, scheme))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('draws a strong line that separates from the ground, and a hairline that stays quieter', () => {
      const strong = contrast(color('--cr-line-strong', scheme), color('--cr-canvas', scheme))
      const hairline = contrast(color('--cr-line', scheme), color('--cr-canvas', scheme))
      expect(strong).toBeGreaterThanOrEqual(2.2)
      expect(hairline).toBeGreaterThan(1.15)
      expect(hairline).toBeLessThan(strong)
    })

    it('draws a footer rule that shows on the footer band', () => {
      expect(
        contrast(color('--cr-footer-line', scheme), color('--cr-footer', scheme)),
      ).toBeGreaterThan(1.3)
    })

    it('sets a band apart from the page, gently', () => {
      const ratio = contrast(color('--cr-surface', scheme), color('--cr-canvas', scheme))
      expect(ratio).toBeGreaterThan(1.05)
      expect(ratio).toBeLessThan(1.5)
    })
  })
}

describe('the dark palette is designed, not inverted', () => {
  const oklch = (property: string, scheme: Scheme) => toOklch(color(property, scheme))

  it('grounds the page in a deep warm charcoal taken from the brass, never pure black', () => {
    const { l, c, h } = oklch('--cr-canvas', 'dark')
    expect(l).toBeGreaterThan(0.15)
    expect(l).toBeLessThan(0.24)
    expect(c).toBeGreaterThan(0.004)
    expect(h).toBeGreaterThan(40)
    expect(h).toBeLessThan(100)
  })

  it('sets type in the paper’s own cream, a step below white', () => {
    const { l } = oklch('--cr-ink', 'dark')
    expect(l).toBeGreaterThan(0.88)
    expect(l).toBeLessThan(0.97)
  })

  it('lifts the brass for the dark ground, keeping its hue', () => {
    expect(oklch('--cr-brass', 'dark').l).toBeGreaterThan(oklch('--cr-brass', 'light').l + 0.15)
    expect(Math.abs(oklch('--cr-brass', 'dark').h - oklch('--cr-brass', 'light').h)).toBeLessThan(3)
  })

  it('expresses depth as a lightness step up from the ground: canvas, band, plate', () => {
    expect(oklch('--cr-surface', 'dark').l).toBeGreaterThan(oklch('--cr-canvas', 'dark').l)
    expect(oklch('--cr-plate', 'dark').l).toBeGreaterThan(oklch('--cr-surface', 'dark').l)
  })

  it('draws a rule as a step up in lightness in the dark, and a step down on paper', () => {
    expect(oklch('--cr-line', 'dark').l).toBeGreaterThan(oklch('--cr-canvas', 'dark').l)
    expect(oklch('--cr-line', 'light').l).toBeLessThan(oklch('--cr-canvas', 'light').l)
  })

  it('flips the filled action to cream with dark words', () => {
    expect(oklch('--cr-action', 'dark').l).toBeGreaterThan(0.85)
    expect(oklch('--cr-action-fg', 'dark').l).toBeLessThan(0.25)
  })

  it('ends every page on its heaviest band: charcoal on paper, below the ground in the dark', () => {
    expect(oklch('--cr-footer', 'light').l).toBeLessThan(0.3)
    expect(oklch('--cr-footer', 'dark').l).toBeLessThan(oklch('--cr-canvas', 'dark').l)
  })

  it('keeps a pale plate behind marks in the dark, so a wordmark drawn for paper stays legible', () => {
    expect(oklch('--cr-mark-plate', 'dark').l).toBeGreaterThan(0.85)
  })

  it('dims photographs in the dark with a brightness step, never a blur', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/\[data-theme="dark"\]\)\s*\{\s*--cr-image-brightness:\s*0\.92/)
    expect(SOURCES.get('base.css')).toMatch(/filter:\s*brightness\(var\(--cr-image-brightness\)\)/)
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
    for (const property of ['--cr-canvas', '--cr-ink', '--cr-brass', '--cr-footer']) {
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
    expect(CR.get('--cr-duration')).toMatch(/min\(var\(--cogenta-motion-duration\), 150ms\)/)
    const literal = [...CODE.matchAll(/transition[^;]*?(\d+(?:\.\d+)?)(ms|s)\b/g)].map((match) =>
      match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]),
    )
    expect(literal.every((ms) => ms <= 150)).toBe(true)
  })

  it('removes every transition under prefers-reduced-motion, through the same token', () => {
    expect(CODE).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--cr-duration:\s*0ms;/,
    )
    const transitions = [...CODE.matchAll(/transition\s*:([^;]*);/g)].map((m) => m[1] as string)
    expect(transitions.length).toBeGreaterThan(3)
    for (const value of transitions) expect(value).toContain('var(--cr-duration)')
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
      expect(['var(--cr-radius)', 'var(--cr-radius-control)', '0']).toContain(value)
    }
  })

  it('keeps the brass to details: small capitals, a focus ring, a selection, an underline', () => {
    const uses = [...CODE.matchAll(/([a-z-]+)\s*:\s*[^;{}]*var\(--cr-brass\)[^;{}]*;/g)].map(
      (match) => match[1] as string,
    )
    expect(uses.length).toBeGreaterThan(0)
    expect(uses.length).toBeLessThanOrEqual(12)
    for (const property of uses) {
      expect(['color', 'outline', 'background', 'text-decoration-color']).toContain(property)
    }
    expect(rule('.cr-prose__body a')).toMatch(/text-decoration-color:\s*var\(--cr-brass\)/)
  })

  it('sets brass text only in small capitals, never at the size of running text', () => {
    const brassText = [...CODE.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) =>
      /(?:^|[;\s])color:\s*var\(--cr-brass\)/.test(match[2] as string),
    )
    expect(brassText.length).toBeGreaterThanOrEqual(3)
    for (const match of brassText) {
      expect(match[2], match[1]).toMatch(/font-variant-caps:\s*all-small-caps/)
    }
  })

  it('draws every arrow link as inline content, so its words carry one continuous underline', () => {
    const arrow = CODE.match(
      /\.cg-action\[data-emphasis="secondary"\],\s*\.cr-arrow-link\s*\{([^}]*)\}/,
    )?.[1]
    expect(arrow).toBeDefined()
    expect(arrow).toMatch(/display:\s*inline-block/)
    expect(arrow).not.toMatch(/display:\s*(inline-)?flex/)
    expect(CODE).toMatch(
      /\.cr-arrow-link::after\s*\{\s*content:\s*"\\2192" \/ "";\s*display:\s*inline-block/,
    )
  })

  it('separates with space and hairlines: no box behind a dish, no hover state on a card', () => {
    expect(rule('.cr-menu__item')).not.toMatch(/background|border/)
    expect(CODE).not.toMatch(
      /\.cr-menu__item:hover|\.cr-plates__item:hover|\.cr-photos__item:hover/,
    )
    expect(rule('.cr-cta__inner')).not.toMatch(/background/)
  })

  it('never uppercases a label, and tracks out only the small capitals', () => {
    expect(CODE).not.toMatch(/text-transform:\s*uppercase/)
    const tracking = [...CODE.matchAll(/letter-spacing:\s*([^;]+);/g)].map((m) =>
      (m[1] as string).trim(),
    )
    for (const value of tracking) {
      if (value.startsWith('var(')) continue
      expect(Number.parseFloat(value)).toBeLessThanOrEqual(0.02)
    }
    const caps = Number.parseFloat(CR.get('--cr-tracking-caps') ?? '1')
    expect(caps).toBeGreaterThan(0.04)
    expect(caps).toBeLessThanOrEqual(0.1)
    for (const body of rulesFor('')) {
      if (!body.includes('var(--cr-tracking-caps)')) continue
      expect(body).toMatch(/font-variant-caps:\s*all-small-caps/)
    }
  })
})

describe('the typography', () => {
  it('holds the reading measure between 60 and 75 characters', () => {
    const measure = Number(CR.get('--cr-measure')?.replace('ch', ''))
    expect(measure).toBeGreaterThanOrEqual(60)
    expect(measure).toBeLessThanOrEqual(75)
  })

  it('balances headings and wraps paragraphs without orphans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*text-wrap:\s*balance/)
    expect(CODE).toMatch(/p, li, dd, figcaption, blockquote\)\s*\{[^}]*text-wrap:\s*pretty/)
  })

  it('hangs punctuation where the browser supports it, and quotes with real quotation marks', () => {
    expect(CODE).toMatch(/hanging-punctuation:\s*first/)
    expect(rule('.cr-quote__text')).toMatch(/quotes:\s*"\\201C" "\\201D"/)
  })

  it('sets headings in the display serif and running text in the text face', () => {
    expect(CODE).toMatch(
      /h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-family:\s*var\(--cr-font-display\)/,
    )
    expect(rule('body')).toMatch(/font-family:\s*var\(--cr-font-text\)/)
  })

  it('sets prices and figures in tabular lining numerals wherever numbers are compared', () => {
    for (const selector of [
      '.cr-menu__price',
      '.cr-dish__price',
      '.cr-plates__price',
      '.cr-set__amount',
      '.cr-figures__value',
      '.cr-footer__copyright',
      ':where(data, time)',
    ]) {
      expect(rule(selector), selector).toMatch(/tabular-nums/)
    }
  })

  it('sets menu prices in the text face, the way a menu card prints them', () => {
    expect(rule('.cr-menu__price')).not.toMatch(/font-family:\s*var\(--cr-font-display\)/)
  })

  it('names the parts of the menu in true small capitals', () => {
    expect(rule('.cr-menu__section-title')).toMatch(/font-variant-caps:\s*all-small-caps/)
    expect(rule('.cr-dish__section')).toMatch(/font-variant-caps:\s*all-small-caps/)
  })

  it('tightens the tracking of the display sizes, without letting letters touch', () => {
    const tracking = Number.parseFloat(CR.get('--cr-tracking-display') ?? '0')
    expect(tracking).toBeLessThan(0)
    expect(tracking).toBeGreaterThan(-0.03)
  })

  it('sets the name of the restaurant light and large', () => {
    expect(rule('.cr-hero__title')).toMatch(/font-weight:\s*var\(--cr-weight-light\)/)
    expect(rule('.cr-hero__title')).toMatch(/font-size:\s*var\(--cr-size-name\)/)
  })

  it('styles a photograph with nothing but its crop and a brightness step', () => {
    const imageRules = [...CODE.matchAll(/__image[^{,]*\{([^}]*)\}/g)].map((m) => m[1] as string)
    expect(imageRules.length).toBeGreaterThan(5)
    for (const body of imageRules) expect(body).not.toMatch(/shadow|blur|opacity|transform|radius/)
  })
})

describe('the grid, the menu and the plates', () => {
  it('lays every block on twelve columns with constant gutters and an explicit page width', () => {
    expect(CR.get('--cr-columns')).toBe('12')
    expect(CR.get('--cr-page')).toMatch(/rem$/)
    expect(rule('.cr-container')).toMatch(
      /grid-template-columns:\s*repeat\(var\(--cr-columns\), minmax\(0, 1fr\)\)/,
    )
  })

  it('spaces every block with the one section rhythm', () => {
    expect(rule('.cr-section')).toMatch(/padding-block:\s*calc\(var\(--cr-section\) \/ 2\)/)
  })

  it('draws a dotted leader from a dish to its price, on the shared last baseline', () => {
    expect(rule('.cr-menu__leader')).toMatch(/border-block-end:\s*var\(--cr-rule-strong\) dotted/)
    expect(rule('.cr-menu__line')).toMatch(/align-items:\s*last baseline/)
  })

  it('sets the sections of a menu in two columns on a wide screen, never splitting a section', () => {
    const menu = SOURCES.get('menu.css') as string
    expect(menu).toMatch(/column-count:\s*2/)
    expect(rulesFor('.cr-menu__section').some((body) => /break-inside:\s*avoid/.test(body))).toBe(
      true,
    )
  })

  it('crops every dish photograph to the same 4:5, wherever it appears', () => {
    for (const selector of ['.cr-dish__image', '.cr-plates__image', '.cr-photos__image']) {
      expect(rule(selector), selector).toMatch(/aspect-ratio:\s*4 \/ 5/)
    }
    expect(rule('.cr-gallery[data-layout="grid"] .cr-gallery__image')).toMatch(
      /aspect-ratio:\s*4 \/ 5/,
    )
  })

  it('keeps the header on the page’s own ground, with a hairline, and lets it scroll away', () => {
    expect(rule('.cr-header')).toMatch(/position:\s*relative/)
    expect(rule('.cr-header')).toMatch(/background:\s*var\(--cr-canvas\)/)
    expect(rule('.cr-header')).toMatch(
      /border-block-end:\s*var\(--cr-rule\) solid var\(--cr-line\)/,
    )
  })

  it('opens the mobile menu with the checkbox alone, no script', () => {
    expect(CODE).toMatch(/\.cr-nav-toggle-input:checked ~ \.cr-header__nav\s*\{\s*display:\s*block/)
  })

  it('shows the address card in the mobile panel only', () => {
    expect(CODE).toMatch(/min-width: 64rem\)[\s\S]*\.cr-header__card\s*\{\s*display:\s*none/)
  })

  it('ends the page on the footer band', () => {
    expect(rule('.cr-footer')).toMatch(/background:\s*var\(--cr-footer\)/)
  })
})
