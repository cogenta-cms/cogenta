import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is written entirely as
 * functions of contract D's closed token set. A misspelt skin variable and a
 * derived colour that fails contrast both pass a snapshot, so this file
 * resolves the real stylesheet against the real default skin and computes the
 * answers, in both schemes; then it holds the studio charter
 * (`docs/lots/L27-themes-niveau-studio.md`) against the stylesheets themselves.
 */

const STYLE_DIR = new URL('../src/styles/', import.meta.url)
const SHEETS = [
  'tokens.css',
  'base.css',
  'chrome.css',
  'docs.css',
  'rich.css',
  'blocks.css',
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
  for (const match of css.matchAll(/(--cd-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1] as string
    const value = (match[2] as string).replace(/\s+/g, ' ').trim()
    if (!found.has(name) || value.includes('light-dark(')) found.set(name, value)
  }
  return found
}

const CD = declarations((SOURCES.get('tokens.css') as string).replace(/\/\*[\s\S]*?\*\//g, ''))

const VARIABLES = new Map<string, string>([
  ...[...CD].map(([name, value]) => [name, value] as const),
  ...Object.entries(skin.color ?? {}).map(
    ([name, value]) => [`--cogenta-color-${kebab(name)}`, String(value)] as const,
  ),
])

function color(property: string, scheme: Scheme): Srgb {
  const declared = CD.get(property)
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
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--cd-[a-z0-9-]+)\s*(,?)/g)]
      .filter((match) => match[2] === '')
      .map((match) => match[1] as string)
    const declaredAnywhere = new Set([
      ...CD.keys(),
      ...[...CODE.matchAll(/(--cd-[a-z0-9-]+)\s*:/g)].map((match) => match[1] as string),
    ])
    const missing = [...new Set(referenced)].filter((name) => !declaredAnywhere.has(name))
    expect(missing).toEqual([])
  })
})

/**
 * Contract D validates three pairs on the skin itself. These are the pairs
 * the theme invents on top of it, every one of them used for text, code
 * comments included.
 */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--cd-ink', '--cd-canvas'],
  ['--cd-ink', '--cd-surface'],
  ['--cd-ink', '--cd-raised'],
  ['--cd-ink', '--cd-footer'],
  ['--cd-ink', '--cd-code-ground'],
  ['--cd-ink-muted', '--cd-canvas'],
  ['--cd-ink-muted', '--cd-surface'],
  ['--cd-ink-muted', '--cd-raised'],
  ['--cd-ink-muted', '--cd-footer'],
  ['--cd-ink-muted', '--cd-code-ground'],
  ['--cd-ink-soft', '--cd-canvas'],
  ['--cd-ink-soft', '--cd-surface'],
  ['--cd-ink-soft', '--cd-code-ground'],
  ['--cd-link', '--cd-canvas'],
  ['--cd-link', '--cd-surface'],
  ['--cd-link', '--cd-footer'],
  ['--cd-accent-hover', '--cd-canvas'],
  ['--cd-accent-fg', '--cd-accent'],
  ['--cd-accent-fg', '--cd-accent-hover'],
  ['--cd-canvas', '--cd-ink'],
]

for (const scheme of ['light', 'dark'] as const) {
  describe(`the ${scheme} palette`, () => {
    for (const [foreground, background] of TEXT_PAIRS) {
      it(`reaches AA body contrast for ${foreground} on ${background}`, () => {
        const ratio = contrast(color(foreground, scheme), color(background, scheme))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('draws a focus ring and a current-page rule in a teal that stands out from the ground (WCAG 1.4.11)', () => {
      expect(contrast(color('--cd-accent', scheme), color('--cd-canvas', scheme))).toBeGreaterThan(
        3,
      )
    })

    it('draws a strong line that separates from the ground, and a hairline that stays quieter', () => {
      const strong = contrast(color('--cd-line-strong', scheme), color('--cd-canvas', scheme))
      const hairline = contrast(color('--cd-line', scheme), color('--cd-canvas', scheme))
      expect(strong).toBeGreaterThanOrEqual(1.8)
      expect(hairline).toBeGreaterThan(1.12)
      expect(hairline).toBeLessThan(strong)
    })

    it('sets code on its own ground, a gentle step from the page', () => {
      const ratio = contrast(color('--cd-code-ground', scheme), color('--cd-canvas', scheme))
      expect(ratio).toBeGreaterThan(1.02)
      expect(ratio).toBeLessThan(1.3)
    })
  })
}

describe('the dark palette is designed for reading code, not inverted', () => {
  const oklch = (property: string, scheme: Scheme) => toOklch(color(property, scheme))

  it('grounds the page in a cool near-black taken from the ink, never pure black', () => {
    const { l, c } = oklch('--cd-canvas', 'dark')
    expect(l).toBeGreaterThan(0.12)
    expect(l).toBeLessThan(0.22)
    expect(c).toBeLessThan(0.03)
  })

  it('sets text in a soft white, a step below pure white, so long code does not vibrate', () => {
    const { l } = oklch('--cd-ink', 'dark')
    expect(l).toBeGreaterThan(0.88)
    expect(l).toBeLessThan(0.96)
  })

  it('raises code a step above the page in the dark, and sets it a step off the page in light', () => {
    expect(oklch('--cd-code-ground', 'dark').l).toBeGreaterThan(oklch('--cd-canvas', 'dark').l)
    expect(oklch('--cd-code-ground', 'light').l).toBeLessThan(oklch('--cd-canvas', 'light').l)
  })

  it('expresses depth as a lightness step up from the ground: canvas, band, raised panel', () => {
    expect(oklch('--cd-surface', 'dark').l).toBeGreaterThan(oklch('--cd-canvas', 'dark').l)
    expect(oklch('--cd-raised', 'dark').l).toBeGreaterThan(oklch('--cd-surface', 'dark').l)
  })

  it('draws hairlines as a step up in lightness in the dark, and a step down on white', () => {
    expect(oklch('--cd-line', 'dark').l).toBeGreaterThan(oklch('--cd-canvas', 'dark').l)
    expect(oklch('--cd-line', 'light').l).toBeLessThan(oklch('--cd-canvas', 'light').l)
  })

  it('lifts the teal for the dark ground, keeping its hue', () => {
    expect(oklch('--cd-accent', 'dark').l).toBeGreaterThan(oklch('--cd-accent', 'light').l + 0.2)
    expect(Math.abs(oklch('--cd-accent', 'dark').h - oklch('--cd-accent', 'light').h)).toBeLessThan(
      8,
    )
  })

  it('turns the primary button pale teal with near-black words in the dark', () => {
    expect(oklch('--cd-accent', 'dark').l).toBeGreaterThan(0.7)
    expect(oklch('--cd-accent-fg', 'dark').l).toBeLessThan(0.25)
  })

  it('ends every page on a footer below the ground in the dark, and a pale band on white', () => {
    expect(oklch('--cd-footer', 'dark').l).toBeLessThan(oklch('--cd-canvas', 'dark').l)
    expect(oklch('--cd-footer', 'light').l).toBeGreaterThan(0.9)
  })

  it('dims diagrams in the dark with a brightness step, never a blur', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/\[data-theme="dark"\]\)\s*\{\s*--cd-image-brightness:\s*0\.88/)
    expect(SOURCES.get('base.css')).toMatch(/filter:\s*brightness\(var\(--cd-image-brightness\)\)/)
  })

  it('inverts wordmarks in the dark, so a logo drawn in dark ink stays legible', () => {
    expect(CODE).toMatch(
      /\[data-theme="dark"\] \.cd-mark\s*\{\s*filter:\s*grayscale\(1\) invert\(1\)/,
    )
  })
})

describe('the scheme switch', () => {
  const tokens = SOURCES.get('tokens.css') as string

  it('declares a colour scheme, so native controls follow the palette', () => {
    expect(tokens).toMatch(/color-scheme:\s*light dark/)
  })

  it('lets a visitor override the OS preference in both directions', () => {
    expect(tokens).toMatch(/\[data-theme="dark"\][^{]*\{[^}]*color-scheme:\s*dark/)
    expect(tokens).toMatch(/\[data-theme="light"\][^{]*\{[^}]*color-scheme:\s*light/)
  })

  it('guards the scheme-aware values behind a feature query with a light fallback', () => {
    expect(tokens).toMatch(/@supports \(color: light-dark\(/)
    const before = tokens.slice(0, tokens.indexOf('@supports (color:'))
    for (const property of [
      '--cd-canvas',
      '--cd-ink',
      '--cd-accent',
      '--cd-footer',
      '--cd-line',
      '--cd-code-ground',
    ]) {
      expect(before, `${property} needs a pre-@supports fallback`).toContain(`${property}:`)
    }
  })

  it('swaps the light and dark toggle icons in both directions', () => {
    expect(CODE).toMatch(
      /\[data-theme="dark"\] \.cg-theme-toggle__icon--sun\s*\{\s*display:\s*none/,
    )
    expect(CODE).toMatch(
      /prefers-color-scheme: dark\)[\s\S]*\.cg-theme-toggle__icon--moon\s*\{\s*display:\s*block/,
    )
  })
})

describe('the motion, depth and colour rules of the charter', () => {
  it('caps every transition at 150 ms through the one duration token', () => {
    expect(CD.get('--cd-duration')).toMatch(/min\(var\(--cogenta-motion-duration\), 150ms\)/)
    const transitions = [...CODE.matchAll(/transition\s*:([^;]*);/g)].map((m) => m[1] as string)
    expect(transitions.length).toBeGreaterThan(5)
    for (const value of transitions) expect(value).toContain('var(--cd-duration)')
  })

  it('removes every transition under prefers-reduced-motion, through the same token', () => {
    expect(CODE).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--cd-duration:\s*0ms;/,
    )
  })

  it('transitions nothing but colours and underlines', () => {
    const transitions = [...CODE.matchAll(/transition\s*:([^;]*);/g)].map((m) => m[1] as string)
    for (const value of transitions) {
      for (const part of value.split(',')) {
        expect(['color', 'background-color', 'border-color', 'text-decoration-color']).toContain(
          part.trim().split(/\s+/)[0],
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

  it('casts no shadow at all, on a picture or anywhere else', () => {
    expect(CODE).not.toMatch(/box-shadow|drop-shadow|text-shadow/)
    expect(ALL_CSS).not.toMatch(/--cogenta-shadow-/)
  })

  it('draws no gradient, no blur, no frosted glass, and fades nothing but a placeholder back to full strength', () => {
    expect(CODE).not.toMatch(/gradient\(|backdrop-filter|blur\(/)
    for (const { selector, body } of blocks()) {
      if (/opacity\s*:/.test(body)) expect(selector).toMatch(/::placeholder$/)
    }
  })

  it('softens corners by a hair only: controls, frames, inline code, and a round portrait', () => {
    const radii = blocks().flatMap(({ selector, body }) =>
      [...body.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => ({
        selector,
        value: (m[1] as string).trim(),
      })),
    )
    expect(radii.length).toBeGreaterThan(5)
    for (const { selector, value } of radii) {
      if (value === '50%') {
        expect(selector).toBe('.cd-person__avatar')
        continue
      }
      expect([
        'var(--cd-radius-control)',
        'var(--cd-radius-frame)',
        'var(--cd-radius-inline)',
      ]).toContain(value)
    }
  })

  it('keeps the teal to links, focus, the current page, a note’s rule and the primary button', () => {
    const uses = blocks().flatMap(({ selector, body }) =>
      [...body.matchAll(/([a-z-]+)\s*:\s*[^;{}]*var\(--cd-accent\)[^;{}]*;/g)].map((m) => ({
        selector,
        property: m[1] as string,
      })),
    )
    expect(uses.length).toBeGreaterThan(3)
    expect(uses.length).toBeLessThanOrEqual(16)
    for (const { selector, property } of uses) {
      expect(
        ['background', 'border', 'border-color', 'outline', 'border-inline-start-color'],
        selector,
      ).toContain(property)
      if (property === 'background') expect(selector).toMatch(/primary|::selection|button|submit/)
      if (property === 'border-inline-start-color')
        expect(selector).toMatch(/aria-current|data-kind="note"/)
    }
  })

  it('never paints a band, a panel or a card in a colour other than the neutrals', () => {
    for (const { selector, body } of blocks()) {
      const background = /(?:^|;)\s*background:\s*([^;]+);/.exec(body)?.[1]?.trim()
      if (background === undefined) continue
      expect(
        [
          'var(--cd-canvas)',
          'var(--cd-surface)',
          'var(--cd-raised)',
          'var(--cd-footer)',
          'var(--cd-code-ground)',
          'var(--cd-accent)',
          'var(--cd-accent-hover)',
          'var(--cd-ink)',
          'var(--cd-ink-muted)',
          'var(--cd-line)',
          'transparent',
        ],
        selector,
      ).toContain(background)
    }
    expect(rule('.cd-cta__panel')).not.toMatch(/background/)
    expect(rule('.cd-plans__item[data-highlighted="true"]')).not.toMatch(/background/)
  })

  it('draws every arrow link as inline content, so its words carry one continuous underline', () => {
    const arrow = CODE.match(
      /\.cg-action\[data-emphasis="secondary"\],\s*\.cd-arrow-link\s*\{([^}]*)\}/,
    )?.[1]
    expect(arrow).toBeDefined()
    expect(arrow).toMatch(/display:\s*inline-block/)
    expect(arrow).toMatch(/text-decoration-line:\s*underline/)
    expect(arrow).not.toMatch(/display:\s*(inline-)?flex/)
    expect(CODE).toMatch(
      /\.cd-arrow-link::after\s*\{\s*content:\s*"\\2192" \/ "";\s*display:\s*inline-block/,
    )
  })

  it('never uppercases a label', () => {
    expect(CODE).not.toMatch(/text-transform:\s*uppercase|font-variant-caps:\s*all-small-caps/)
  })

  it('holds the rules of a closing panel to the width of the content, never across the gutters', () => {
    expect(rule('.cd-cta__panel')).toMatch(
      /border-block:\s*var\(--cd-rule\) solid var\(--cd-line\)/,
    )
    expect(CODE).not.toMatch(/\.cd-cta__inner\s*\{[^}]*border/)
  })
})

describe('the typography', () => {
  it('holds running text to a measure of 60 to 75 characters', () => {
    // A `ch` is the width of Plex Sans's zero, wider than its average letter:
    // measured in Chrome on the scaffolded site, 60ch set 77 characters to a
    // line and 56ch sets about 70. The bounds below are that range in `ch`.
    const measure = Number(CD.get('--cd-measure')?.replace('ch', ''))
    expect(measure).toBeGreaterThanOrEqual(50)
    expect(measure).toBeLessThanOrEqual(58)
    expect(rule('.cd-rich > :is(p, ul, ol, h2, h3, h4, blockquote)')).toMatch(
      /max-inline-size:\s*var\(--cd-measure\)/,
    )
  })

  it('balances headings and wraps paragraphs without orphans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*text-wrap:\s*balance/)
    expect(CODE).toMatch(/p, li, dd, figcaption, blockquote\)\s*\{[^}]*text-wrap:\s*pretty/)
  })

  it('hangs punctuation where the browser supports it, and quotes with real quotation marks', () => {
    expect(CODE).toMatch(/hanging-punctuation:\s*first/)
    expect(CODE).toMatch(/quotes:\s*"\\201C" "\\201D"/)
  })

  it('sets headings and running text in the one sans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-family:\s*var\(--cd-font-sans\)/)
    expect(rule('body')).toMatch(/font-family:\s*var\(--cd-font-sans\)/)
  })

  it('prints what a machine prints in Plex Mono: code, file names, terms, types, versions', () => {
    expect(CODE).toMatch(
      /:where\(code, kbd, samp, pre\)\s*\{\s*font-family:\s*var\(--cd-font-mono\)/,
    )
    for (const selector of [
      '.cd-code__label',
      '.cd-ref__term',
      '.cd-ref__meta',
      '.cd-hero__eyebrow',
    ]) {
      expect(rule(selector), selector).toMatch(/font-family:\s*var\(--cd-font-mono\)/)
    }
  })

  it('sets prices, figures, counts and dates in tabular numerals', () => {
    for (const selector of [
      '.cd-plans__amount',
      '.cd-figures__value',
      '.cd-footer__copyright',
      ':where(data, time)',
    ]) {
      expect(rule(selector), selector).toMatch(/tabular-nums/)
    }
  })

  it('tightens the tracking of the display sizes, without letting letters touch', () => {
    const tracking = Number.parseFloat(CD.get('--cd-tracking-display') ?? '0')
    expect(tracking).toBeLessThan(-0.01)
    expect(tracking).toBeGreaterThan(-0.04)
    expect(rule('.cd-hero__title')).toMatch(/letter-spacing:\s*var\(--cd-tracking-display\)/)
  })

  it('never lets an image carry a shadow, a tilt or a fade', () => {
    const imageRules = blocks().filter(({ selector }) => /image|img|__media|frame/.test(selector))
    expect(imageRules.length).toBeGreaterThan(4)
    for (const { selector, body } of imageRules) {
      expect(body, selector).not.toMatch(/shadow|blur|opacity|rotate|skew|perspective/)
    }
  })
})

describe('the grid, the chrome and a documentation page', () => {
  it('lays pages outside the documentation on twelve columns under one explicit page width', () => {
    expect(CD.get('--cd-columns')).toBe('12')
    expect(CD.get('--cd-page')).toMatch(/rem$/)
    expect(CD.get('--cd-doc-page')).toBe('var(--cd-page)')
    expect(rule('.cd-container')).toMatch(
      /grid-template-columns:\s*repeat\(var\(--cd-columns\), minmax\(0, 1fr\)\)/,
    )
  })

  it('spaces every block with the one section rhythm', () => {
    expect(rule('.cd-section')).toMatch(/padding-block:\s*calc\(var\(--cd-section\) \/ 2\)/)
  })

  it('holds the header at the top on the page’s own ground, under a hairline, without translucency', () => {
    const header = rule('.cd-header')
    expect(header).toMatch(/position:\s*sticky/)
    expect(header).toMatch(/background:\s*var\(--cd-canvas\)/)
    expect(header).toMatch(/border-block-end:\s*var\(--cd-rule\) solid var\(--cd-line\)/)
  })

  it('shows the menu disclosure only below the wide breakpoint, and the search field and sections above it', () => {
    expect(CODE).toMatch(
      /min-width: 64rem\)\s*\{[^@]*\.cd-header__search\s*\{\s*display:\s*block[^@]*\.cd-header__search-link,\s*\.cd-menu\s*\{\s*display:\s*none/,
    )
  })

  it('lays a documentation page in three columns from 80rem, two from 64rem, one below', () => {
    expect(CODE).toMatch(
      /min-width: 64rem\)\s*\{\s*\.cd-doc__layout\s*\{\s*grid-template-columns:\s*var\(--cd-sidebar\) minmax\(0, 1fr\)/,
    )
    expect(CODE).toMatch(
      /min-width: 80rem\)\s*\{\s*\.cd-doc\[data-toc="true"\] \.cd-doc__layout\s*\{\s*grid-template-columns:\s*var\(--cd-sidebar\) minmax\(0, 1fr\) var\(--cd-toc\)/,
    )
  })

  it('holds the navigation in view on a wide screen, and folds it into its disclosure below', () => {
    const wide = CODE.slice(CODE.indexOf('.cd-sidenav-disclosure__summary'))
    expect(wide).toMatch(/\.cd-doc__sidebar\s*\{\s*position:\s*sticky/)
    expect(rule('.cd-sidenav--wide')).toMatch(/display:\s*none/)
    expect(wide).toMatch(/\.cd-sidenav-disclosure\s*\{\s*display:\s*none/)
  })

  it('hides "On this page" below 80rem and holds it in view above', () => {
    expect(rule('.cd-doc__toc')).toMatch(/display:\s*none/)
    expect(CODE).toMatch(/min-width: 80rem\)\s*\{\s*\.cd-doc__toc\s*\{\s*position:\s*sticky/)
  })

  it('scrolls a long line of code inside its own block, never the page', () => {
    const pre = rule('.cd-code__pre')
    expect(pre).toMatch(/overflow-x:\s*auto/)
    expect(pre).toMatch(/white-space:\s*pre/)
    expect(rule('.cd-code__prompt')).toMatch(/user-select:\s*none/)
  })

  it('aligns every row of a reference table on shared column tracks', () => {
    expect(CODE).toMatch(
      /\.cd-ref__row\s*\{\s*grid-column:\s*1 \/ -1;\s*grid-template-columns:\s*subgrid/,
    )
    expect(CODE).toMatch(
      /\.cd-ref\[data-columns="2"\]\s*\{\s*grid-template-columns:\s*minmax\(0, 38%\) minmax\(0, 1fr\)/,
    )
  })

  it('marks the page being read with the teal rule and the teal text', () => {
    const current = rule('.cd-sidenav__link[aria-current="page"]')
    expect(current).toMatch(/border-inline-start-color:\s*var\(--cd-accent\)/)
    expect(current).toMatch(/color:\s*var\(--cd-link\)/)
  })

  it('lays the footer navigation beside the product, on the same page width as the header', () => {
    expect(CODE).toMatch(/\.cd-footer__nav\s*\{\s*grid-column:\s*6 \/ -1/)
    expect(rule('.cd-footer')).toMatch(/background:\s*var\(--cd-footer\)/)
    expect(rule('.cd-footer__inner')).toMatch(
      /max-inline-size:\s*calc\(var\(--cd-doc-page\) \+ var\(--cd-gutter\) \* 2\)/,
    )
  })
})
