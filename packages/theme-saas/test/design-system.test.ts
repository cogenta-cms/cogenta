import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is written entirely as
 * functions of contract D's closed token set. A misspelt skin variable and a
 * derived colour that fails contrast both pass a snapshot, so this file
 * resolves the real stylesheet against the real default skin and computes the
 * answers, in both schemes; then it holds the studio charter
 * (`docs/lots/L27`) against the stylesheets themselves.
 */

const STYLE_DIR = new URL('../src/styles/', import.meta.url)
const SHEETS = [
  'tokens.css',
  'base.css',
  'chrome.css',
  'blocks.css',
  'pricing.css',
  'archive.css',
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
  ...Object.entries(skin).flatMap(([group, values]) =>
    Object.keys(values).map((name) => `--cogenta-${group}-${kebab(name)}`),
  ),
  '--cogenta-space-scale',
  ...TYPE_SCALE_STEPS.map((step) => `--cogenta-font-size-${step}`),
])

function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/(--cs-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1] as string
    const value = (match[2] as string).replace(/\s+/g, ' ').trim()
    if (!found.has(name) || value.includes('light-dark(')) found.set(name, value)
  }
  return found
}

const CS = declarations((SOURCES.get('tokens.css') as string).replace(/\/\*[\s\S]*?\*\//g, ''))

const VARIABLES = new Map<string, string>([
  ...[...CS].map(([name, value]) => [name, value] as const),
  ...Object.entries(skin.color ?? {}).map(
    ([name, value]) => [`--cogenta-color-${kebab(name)}`, String(value)] as const,
  ),
])

function color(property: string, scheme: Scheme): Srgb {
  const declared = CS.get(property)
  expect(declared, `${property} must be declared in tokens.css`).toBeDefined()
  return evaluate(declared as string, { scheme, variables: VARIABLES })
}

function rule(selector: string): string {
  const at = CODE.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThan(-1)
  return CODE.slice(at, CODE.indexOf('}', at))
}

/** Every declaration block, with its selector list. */
function blocks(): { readonly selector: string; readonly body: string }[] {
  return [...CODE.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] as string).trim(),
    body: match[2] as string,
  }))
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
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--cs-[a-z0-9-]+)\s*(,?)/g)]
      .filter((match) => match[2] === '')
      .map((match) => match[1] as string)
    const declaredAnywhere = new Set([
      ...CS.keys(),
      ...[...CODE.matchAll(/(--cs-[a-z0-9-]+)\s*:/g)].map((match) => match[1] as string),
    ])
    const missing = [...new Set(referenced)].filter((name) => !declaredAnywhere.has(name))
    expect(missing).toEqual([])
  })
})

/**
 * Contract D validates three pairs on the skin itself. These are the pairs the
 * theme invents on top of it, every one of them used for text.
 */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--cs-ink', '--cs-canvas'],
  ['--cs-ink', '--cs-surface'],
  ['--cs-ink', '--cs-raised'],
  ['--cs-ink', '--cs-footer'],
  ['--cs-ink-muted', '--cs-canvas'],
  ['--cs-ink-muted', '--cs-surface'],
  ['--cs-ink-muted', '--cs-raised'],
  ['--cs-ink-muted', '--cs-footer'],
  ['--cs-ink-soft', '--cs-canvas'],
  ['--cs-ink-soft', '--cs-surface'],
  ['--cs-link', '--cs-canvas'],
  ['--cs-link', '--cs-surface'],
  ['--cs-accent-fg', '--cs-accent'],
  ['--cs-accent-fg', '--cs-accent-hover'],
  ['--cs-canvas', '--cs-ink'],
]

for (const scheme of ['light', 'dark'] as const) {
  describe(`the ${scheme} palette`, () => {
    for (const [foreground, background] of TEXT_PAIRS) {
      it(`reaches AA body contrast for ${foreground} on ${background}`, () => {
        const ratio = contrast(color(foreground, scheme), color(background, scheme))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('draws a focus ring in the blue that stands out from the ground (WCAG 1.4.11)', () => {
      expect(contrast(color('--cs-accent', scheme), color('--cs-canvas', scheme))).toBeGreaterThan(
        3,
      )
    })

    it('draws a strong line that separates from the ground, and a hairline that stays quieter', () => {
      const strong = contrast(color('--cs-line-strong', scheme), color('--cs-canvas', scheme))
      const hairline = contrast(color('--cs-line', scheme), color('--cs-canvas', scheme))
      expect(strong).toBeGreaterThanOrEqual(1.8)
      expect(hairline).toBeGreaterThan(1.12)
      expect(hairline).toBeLessThan(strong)
    })

    it('sets a band apart from the page, gently', () => {
      const ratio = contrast(color('--cs-surface', scheme), color('--cs-canvas', scheme))
      expect(ratio).toBeGreaterThan(1.02)
      expect(ratio).toBeLessThan(1.3)
    })
  })
}

describe('the dark palette is designed, not inverted', () => {
  const oklch = (property: string, scheme: Scheme) => toOklch(color(property, scheme))

  it('grounds the page in a near-black taken from the ink, never pure black and never tinted', () => {
    const { l, c } = oklch('--cs-canvas', 'dark')
    expect(l).toBeGreaterThan(0.12)
    expect(l).toBeLessThan(0.2)
    expect(c).toBeLessThan(0.02)
  })

  it('sets type in a soft white, a step below pure white', () => {
    const { l } = oklch('--cs-ink', 'dark')
    expect(l).toBeGreaterThan(0.88)
    expect(l).toBeLessThan(0.97)
  })

  it('expresses depth as a lightness step up from the ground: canvas, band, raised panel', () => {
    expect(oklch('--cs-surface', 'dark').l).toBeGreaterThan(oklch('--cs-canvas', 'dark').l)
    expect(oklch('--cs-raised', 'dark').l).toBeGreaterThan(oklch('--cs-surface', 'dark').l)
  })

  it('draws hairlines as a step up in lightness in the dark, and a step down on white', () => {
    expect(oklch('--cs-line', 'dark').l).toBeGreaterThan(oklch('--cs-canvas', 'dark').l)
    expect(oklch('--cs-line', 'light').l).toBeLessThan(oklch('--cs-canvas', 'light').l)
  })

  it('lifts the blue for the dark ground, keeping its hue', () => {
    expect(oklch('--cs-accent', 'dark').l).toBeGreaterThan(oklch('--cs-accent', 'light').l + 0.12)
    expect(Math.abs(oklch('--cs-accent', 'dark').h - oklch('--cs-accent', 'light').h)).toBeLessThan(
      4,
    )
  })

  it('turns the primary button light blue with near-black words in the dark', () => {
    expect(oklch('--cs-accent', 'dark').l).toBeGreaterThan(0.65)
    expect(oklch('--cs-accent-fg', 'dark').l).toBeLessThan(0.25)
  })

  it('ends every page on a footer below the ground in the dark, and a pale band on white', () => {
    expect(oklch('--cs-footer', 'dark').l).toBeLessThan(oklch('--cs-canvas', 'dark').l)
    expect(oklch('--cs-footer', 'light').l).toBeGreaterThan(0.9)
  })

  it('dims screenshots in the dark with a brightness step, never a blur', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/\[data-theme="dark"\]\)\s*\{\s*--cs-image-brightness:\s*0\.9/)
    expect(SOURCES.get('base.css')).toMatch(/filter:\s*brightness\(var\(--cs-image-brightness\)\)/)
  })

  it('inverts wordmarks in the dark, so a logo drawn in dark ink stays legible', () => {
    expect(CODE).toMatch(
      /\[data-theme="dark"\]\)\s*\.cs-mark\s*\{\s*filter:\s*grayscale\(1\) invert\(1\)/,
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
    for (const property of ['--cs-canvas', '--cs-ink', '--cs-accent', '--cs-footer', '--cs-line']) {
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
    expect(CS.get('--cs-duration')).toMatch(/min\(var\(--cogenta-motion-duration\), 150ms\)/)
    const literal = [...CODE.matchAll(/transition[^;]*?(\d+(?:\.\d+)?)(ms|s)\b/g)].map((match) =>
      match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]),
    )
    expect(literal.every((ms) => ms <= 150)).toBe(true)
  })

  it('removes every transition under prefers-reduced-motion, through the same token', () => {
    expect(CODE).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--cs-duration:\s*0ms;/,
    )
    const transitions = [...CODE.matchAll(/transition\s*:([^;]*);/g)].map((m) => m[1] as string)
    expect(transitions.length).toBeGreaterThan(5)
    for (const value of transitions) expect(value).toContain('var(--cs-duration)')
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

  it('never moves, scales, fades or shadows an element on hover', () => {
    const hoverRules = blocks().filter(({ selector }) => selector.includes(':hover'))
    expect(hoverRules.length).toBeGreaterThan(10)
    for (const { selector, body } of hoverRules) {
      expect(body, selector).not.toMatch(
        /transform|translate|box-shadow|scale|rotate|margin|inset|opacity|filter/,
      )
    }
  })

  it('declares no keyframes, no entrance animation and no scroll-driven animation', () => {
    expect(CODE).not.toMatch(
      /@keyframes|animation\s*:|animation-name|animation-timeline|view-timeline|scroll-timeline/,
    )
  })

  it('casts no shadow at all, on a screenshot or anywhere else', () => {
    expect(CODE).not.toMatch(/box-shadow|drop-shadow|text-shadow/)
    expect(ALL_CSS).not.toMatch(/--cogenta-shadow-/)
  })

  it('draws no gradient, no blur, no translucency and no frosted glass', () => {
    expect(CODE).not.toMatch(/gradient\(|backdrop-filter|blur\(|opacity\s*:/)
  })

  it('softens corners by a hair only: controls, frames, and the round portrait of a quote', () => {
    const radii = blocks().flatMap(({ selector, body }) =>
      [...body.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => ({
        selector,
        value: (m[1] as string).trim(),
      })),
    )
    expect(radii.length).toBeGreaterThan(5)
    for (const { selector, value } of radii) {
      if (value === '50%') {
        expect(selector).toBe('.cs-person__avatar')
        continue
      }
      expect([
        'var(--cs-radius-control)',
        'var(--cs-radius-frame)',
        'var(--cogenta-radius-sm)',
      ]).toContain(value)
    }
  })

  it('keeps the blue to links, focus, selection and the primary button: never a band, a card or a heading', () => {
    const uses = blocks().flatMap(({ selector, body }) =>
      [...body.matchAll(/([a-z-]+)\s*:\s*[^;{}]*var\(--cs-accent\)[^;{}]*;/g)].map((m) => ({
        selector,
        property: m[1] as string,
      })),
    )
    expect(uses.length).toBeGreaterThan(3)
    expect(uses.length).toBeLessThanOrEqual(14)
    for (const { selector, property } of uses) {
      expect(['background', 'border', 'border-color', 'outline'], selector).toContain(property)
      if (property === 'background') {
        expect(selector).toMatch(/primary|::selection|button|submit/)
      }
    }
  })

  it('never paints a band, a plan or a card in a colour other than the neutrals', () => {
    for (const { selector, body } of blocks()) {
      const background = /(?:^|;)\s*background:\s*([^;]+);/.exec(body)?.[1]?.trim()
      if (background === undefined) continue
      expect(
        [
          'var(--cs-canvas)',
          'var(--cs-surface)',
          'var(--cs-raised)',
          'var(--cs-footer)',
          'var(--cs-accent)',
          'var(--cs-accent-hover)',
          'var(--cs-ink)',
          'var(--cs-ink-muted)',
          'var(--cs-line)',
          'var(--cs-line-strong)',
          'transparent',
        ],
        selector,
      ).toContain(background)
    }
    expect(rule('.cs-plan')).not.toMatch(/background/)
    expect(rule('.cs-cta__inner')).not.toMatch(/background/)
  })

  it('draws every arrow link as inline content, so its words carry one continuous underline', () => {
    const arrow = CODE.match(
      /\.cg-action\[data-emphasis="secondary"\],\s*\.cs-arrow-link\s*\{([^}]*)\}/,
    )?.[1]
    expect(arrow).toBeDefined()
    expect(arrow).toMatch(/display:\s*inline-block/)
    expect(arrow).toMatch(/text-decoration-line:\s*underline/)
    expect(arrow).not.toMatch(/display:\s*(inline-)?flex/)
    expect(CODE).toMatch(
      /\.cs-arrow-link::after\s*\{\s*content:\s*"\\2192" \/ "";\s*display:\s*inline-block/,
    )
  })

  it('never uppercases a label', () => {
    expect(CODE).not.toMatch(/text-transform:\s*uppercase|font-variant-caps:\s*all-small-caps/)
  })

  it('holds a rule above a block to the width of the content, never across the gutters', () => {
    expect(
      rule('.cs-cta::before,\n.cs-quote::before,\n.cs-testimonial::before,\n.cs-strip::before'),
    ).toMatch(/inline-size:\s*min\(calc\(100% - var\(--cs-gutter\) \* 2\), var\(--cs-page\)\)/)
    expect(rule('.cs-cta__inner')).not.toMatch(/border/)
  })
})

describe('the typography', () => {
  it('holds the reading measure between 60 and 75 characters', () => {
    const measure = Number(CS.get('--cs-measure')?.replace('ch', ''))
    expect(measure).toBeGreaterThanOrEqual(60)
    expect(measure).toBeLessThanOrEqual(75)
    expect(rule('.cs-prose__body')).toMatch(/max-inline-size:\s*var\(--cs-measure\)/)
  })

  it('balances headings and wraps paragraphs without orphans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*text-wrap:\s*balance/)
    expect(CODE).toMatch(/p, li, dd, figcaption, blockquote\)\s*\{[^}]*text-wrap:\s*pretty/)
  })

  it('hangs punctuation where the browser supports it, and quotes with real quotation marks', () => {
    expect(CODE).toMatch(/hanging-punctuation:\s*first/)
    expect(rule('.cs-quote__text')).toMatch(/quotes:\s*"\\201C" "\\201D"/)
    expect(rule('.cs-testimonial__quote > p:first-child')).toMatch(/quotes:\s*"\\201C" "\\201D"/)
  })

  it('sets headings and running text in the one sans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-family:\s*var\(--cs-font-sans\)/)
    expect(rule('body')).toMatch(/font-family:\s*var\(--cs-font-sans\)/)
  })

  it('sets prices, figures, counts and dates in tabular numerals', () => {
    for (const selector of [
      '.cs-plan__amount',
      '.cs-figures__value',
      '.cs-counters__value',
      '.cs-compare .cs-compare__cell',
      '.cs-footer__copyright',
      '.cs-page-head__meta',
      ':where(data, time)',
    ]) {
      expect(rule(selector), selector).toMatch(/tabular-nums/)
    }
  })

  it('prints what software prints in Geist Mono: eyebrows, dates in an index, units, step numbers', () => {
    for (const selector of [
      '.cs-hero__eyebrow',
      '.cs-index__date',
      '.cs-figures__unit',
      '.cs-steps__number',
      '.cs-plan__flag',
    ]) {
      expect(rule(selector), selector).toMatch(/font-family:\s*var\(--cs-font-mono\)/)
    }
  })

  it('tightens the tracking of the display sizes, without letting letters touch', () => {
    const tracking = Number.parseFloat(CS.get('--cs-tracking-display') ?? '0')
    expect(tracking).toBeLessThan(-0.01)
    expect(tracking).toBeGreaterThan(-0.04)
    expect(rule('.cs-hero__title')).toMatch(/letter-spacing:\s*var\(--cs-tracking-display\)/)
  })

  it('sets the hero title semibold and at the display size', () => {
    expect(rule('.cs-hero__title')).toMatch(/font-weight:\s*var\(--cs-weight-semibold\)/)
    expect(rule('.cs-hero__title')).toMatch(/font-size:\s*var\(--cs-size-display\)/)
  })

  it('styles a screenshot with nothing but its frame and a brightness step', () => {
    expect(rule('.cs-frame')).toMatch(/border:\s*var\(--cs-rule\) solid var\(--cs-line\)/)
    expect(rule('.cs-frame')).toMatch(/border-radius:\s*var\(--cs-radius-frame\)/)
    const imageRules = blocks().filter(({ selector }) => /__image\b/.test(selector))
    expect(imageRules.length).toBeGreaterThan(4)
    for (const { selector, body } of imageRules) {
      expect(body, selector).not.toMatch(/shadow|blur|opacity|rotate|skew|perspective/)
    }
  })
})

describe('the grid, the chrome and the pricing table', () => {
  it('lays every block on twelve columns with constant gutters and an explicit page width', () => {
    expect(CS.get('--cs-columns')).toBe('12')
    expect(CS.get('--cs-page')).toMatch(/rem$/)
    expect(rule('.cs-container')).toMatch(
      /grid-template-columns:\s*repeat\(var\(--cs-columns\), minmax\(0, 1fr\)\)/,
    )
  })

  it('spaces every block with the one section rhythm', () => {
    expect(rule('.cs-section')).toMatch(/padding-block:\s*calc\(var\(--cs-section\) \/ 2\)/)
  })

  it('holds the header at the top on the page’s own ground, under a hairline, without translucency', () => {
    const header = rule('.cs-header')
    expect(header).toMatch(/position:\s*sticky/)
    expect(header).toMatch(/background:\s*var\(--cs-canvas\)/)
    expect(header).toMatch(/border-block-end:\s*var\(--cs-rule\) solid var\(--cs-line\)/)
  })

  it('opens the mobile menu with the checkbox alone, no script', () => {
    expect(CODE).toMatch(/\.cs-nav-toggle-input:checked ~ \.cs-header__nav\s*\{\s*display:\s*block/)
  })

  it('shows the menu toggle only below the wide breakpoint', () => {
    expect(CODE).toMatch(/min-width: 56rem\)\s*\{\s*\.cs-nav-toggle-label\s*\{\s*display:\s*none/)
  })

  it('lays the footer navigation in up to four columns beside the company', () => {
    expect(CODE).toMatch(/\.cs-footer__nav\s*\{[^}]*grid-column:\s*6 \/ -1/)
    expect(rule('.cs-footer')).toMatch(/background:\s*var\(--cs-footer\)/)
  })

  it('compares plans in a collapsed, fixed-layout table that scrolls inside its own region on a phone', () => {
    expect(rule('.cs-compare__table')).toMatch(/border-collapse:\s*collapse/)
    expect(rule('.cs-compare__table')).toMatch(/table-layout:\s*fixed/)
    expect(rule('.cs-compare')).toMatch(/overflow-x:\s*auto/)
    expect(rule('.cs-compare')).toMatch(/position:\s*relative/)
  })

  it('reads the plans’ grid and the table’s columns from one label-column width, never from a cell', () => {
    const wide = CODE.slice(CODE.indexOf('@media (min-width: 64rem)'))
    expect(wide).toMatch(
      /\.cs-pricing\[data-shape="compare"\] \.cs-pricing__top\s*\{[^}]*grid-template-columns:\s*var\(--cs-label-column\) minmax\(0, 1fr\)/,
    )
    expect(wide).toMatch(
      /\.cs-pricing\[data-shape="compare"\] \.cs-pricing__plans\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--cs-plan-columns, 3\), minmax\(0, 1fr\)\)/,
    )
    expect(wide).toMatch(
      /\.cs-compare__col\[data-column="label"\]\s*\{\s*inline-size:\s*var\(--cs-label-column\)/,
    )
    // A width on a cell would compete with the columns and let the rows drift
    // away from the plans above them.
    for (const { selector, body } of blocks()) {
      if (/cs-compare__(corner|label|tier|cell)/.test(selector)) {
        expect(body, selector).not.toMatch(/(^|[;\s])(inline-size|width):/)
      }
    }
  })

  it('marks the recommended plan with a rule in ink, never a tinted card', () => {
    expect(rule('.cs-plan[data-highlighted="true"]')).toMatch(
      /border-block-start:\s*var\(--cs-rule-strong\) solid var\(--cs-line-ink\)/,
    )
    expect(rule('.cs-plan[data-highlighted="true"]')).not.toMatch(/background/)
  })

  it('crops the product tour, the cards and a feature cover to the same 16:10', () => {
    for (const selector of ['.cs-tour__media', '.cs-cards__media', '.cs-page-head__cover']) {
      expect(rule(selector), selector).toMatch(/aspect-ratio:\s*16 \/ 10/)
    }
  })
})
