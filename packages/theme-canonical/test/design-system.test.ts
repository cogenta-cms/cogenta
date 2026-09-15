import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is the layer every block
 * inherits from, written entirely as functions of contract D's closed token
 * set. A misspelt skin variable and a derived colour that fails contrast both
 * pass a snapshot, so this file resolves the real stylesheet against real
 * skins and computes the answers, in both schemes — the default skin, and two
 * skins this theme did not choose, because the default theme is the one every
 * other skin ends up on. Then it holds the studio charter (`docs/lots/L27`)
 * against the stylesheets themselves.
 */

const STYLE_DIR = new URL('../src/styles/', import.meta.url)
const SHEETS = [
  'tokens.css',
  'base.css',
  'chrome.css',
  'blocks.css',
  'listings.css',
  'archive.css',
  'utility.css',
  'widgets.css',
] as const

const SOURCES = new Map(
  SHEETS.map((name) => [name, readFileSync(new URL(name, STYLE_DIR), 'utf8')] as const),
)
const ALL_CSS = [...SOURCES.values()].join('\n')
const CODE = ALL_CSS.replace(/\/\*[\s\S]*?\*\//g, '')

type Skin = Record<string, Record<string, string | number | boolean>>

const skin = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8')) as Skin

/** Two skins of other registers, as an editor or the theme workshop might apply them. */
const FOREIGN_SKINS: Readonly<Record<string, Record<string, string>>> = {
  'a warm paper skin with a navy accent': {
    bg: '#f6f2ea',
    fg: '#1e1b17',
    accent: '#26426b',
    accentFg: '#ffffff',
    muted: '#ece5d8',
    mutedFg: '#5a5147',
    border: '#ddd4c5',
  },
  'a white skin with a loud orange accent': {
    bg: '#ffffff',
    fg: '#0b0b0b',
    accent: '#ff4f00',
    accentFg: '#000000',
    muted: '#f1f1ef',
    mutedFg: '#5b5b58',
    border: '#dcdcd8',
  },
}

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

/** `--cg-x: value;` — the scheme-aware declaration wins over its plain fallback. */
function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/(--cg-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1] as string
    const value = (match[2] as string).replace(/\s+/g, ' ').trim()
    if (!found.has(name) || value.includes('light-dark(')) found.set(name, value)
  }
  return found
}

const TOKENS_CODE = (SOURCES.get('tokens.css') as string).replace(/\/\*[\s\S]*?\*\//g, '')
const CG = declarations(TOKENS_CODE)

function variablesFor(colors: Record<string, string | number | boolean>): Map<string, string> {
  return new Map<string, string>([
    ...[...CG].map(([name, value]) => [name, value] as const),
    ...Object.entries(colors).map(
      ([name, value]) => [`--cogenta-color-${kebab(name)}`, String(value)] as const,
    ),
  ])
}

const DEFAULT_VARIABLES = variablesFor(skin.color ?? {})

function color(property: string, scheme: Scheme, variables = DEFAULT_VARIABLES): Srgb {
  const declared = CG.get(property)
  expect(declared, `${property} must be declared in tokens.css`).toBeDefined()
  return evaluate(declared as string, { scheme, variables })
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
    // A reference that carries a fallback is fine undeclared: `--cg-ratio` is
    // set per element by the renderer's inline style, never in a sheet.
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--cg-[a-z0-9-]+)\s*(,?)/g)]
      .filter((match) => match[2] === '')
      .map((match) => match[1] as string)
    const missing = [...new Set(referenced)].filter((name) => !CG.has(name))
    expect(missing).toEqual([])
  })
})

/**
 * Contract D validates three pairs on the skin itself. These are the pairs the
 * theme invents on top of it, every one of them used for text.
 */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--cg-ink', '--cg-canvas'],
  ['--cg-ink', '--cg-band'],
  ['--cg-ink', '--cg-footer'],
  ['--cg-ink', '--cg-selection'],
  ['--cg-ink-muted', '--cg-canvas'],
  ['--cg-ink-muted', '--cg-band'],
  ['--cg-ink-muted', '--cg-footer'],
  ['--cg-accent', '--cg-canvas'],
  ['--cg-accent', '--cg-band'],
  ['--cg-accent', '--cg-footer'],
  ['--cg-accent-hover', '--cg-canvas'],
  ['--cg-action-fg', '--cg-action'],
  ['--cg-action-fg', '--cg-action-hover'],
]

const SKINS: readonly (readonly [string, Map<string, string>])[] = [
  ['the default skin', DEFAULT_VARIABLES],
  ...Object.entries(FOREIGN_SKINS).map(([name, colors]) => [name, variablesFor(colors)] as const),
]

for (const [skinName, variables] of SKINS) {
  for (const scheme of ['light', 'dark'] as const) {
    describe(`the ${scheme} palette under ${skinName}`, () => {
      for (const [foreground, background] of TEXT_PAIRS) {
        it(`reaches AA body contrast for ${foreground} on ${background}`, () => {
          const ratio = contrast(
            color(foreground, scheme, variables),
            color(background, scheme, variables),
          )
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })
      }

      it('draws the focus ring and a control’s edge at 3:1 against the page (WCAG 1.4.11)', () => {
        const canvas = color('--cg-canvas', scheme, variables)
        expect(contrast(color('--cg-accent', scheme, variables), canvas)).toBeGreaterThanOrEqual(3)
        expect(
          contrast(color('--cg-line-strong', scheme, variables), canvas),
        ).toBeGreaterThanOrEqual(3)
      })

      it('keeps a hairline visible and quieter than a control’s edge', () => {
        const canvas = color('--cg-canvas', scheme, variables)
        const hairline = contrast(color('--cg-line', scheme, variables), canvas)
        expect(hairline).toBeGreaterThan(1.12)
        expect(hairline).toBeLessThan(
          contrast(color('--cg-line-strong', scheme, variables), canvas),
        )
      })

      it('sets a band apart from the page, gently', () => {
        const ratio = contrast(
          color('--cg-band', scheme, variables),
          color('--cg-canvas', scheme, variables),
        )
        expect(ratio).toBeGreaterThan(1.03)
        expect(ratio).toBeLessThan(1.4)
      })
    })
  }
}

describe('the dark palette is designed, not inverted', () => {
  const oklch = (property: string, scheme: Scheme, variables = DEFAULT_VARIABLES) =>
    toOklch(color(property, scheme, variables))

  it('grounds the page in a near-black taken from the skin’s ink, never pure black', () => {
    const { l, c } = oklch('--cg-canvas', 'dark')
    expect(l).toBeGreaterThan(0.12)
    expect(l).toBeLessThan(0.2)
    expect(c).toBeLessThan(0.01)
  })

  it('gives a warm skin a warm dark page, from the same derivation', () => {
    const warm = variablesFor(FOREIGN_SKINS['a warm paper skin with a navy accent'] ?? {})
    const canvas = oklch('--cg-canvas', 'dark', warm)
    const ink = toOklch(evaluate('#1e1b17', { scheme: 'dark', variables: warm }))
    expect(canvas.c).toBeGreaterThan(0.002)
    expect(Math.abs(canvas.h - ink.h)).toBeLessThan(4)
  })

  it('sets type in the skin’s own paper, a step below white', () => {
    const { l } = oklch('--cg-ink', 'dark')
    expect(l).toBeGreaterThan(0.88)
    expect(l).toBeLessThan(0.97)
  })

  it('expresses depth as lightness: the footer below the ground, a band above it', () => {
    expect(oklch('--cg-band', 'dark').l).toBeGreaterThan(oklch('--cg-canvas', 'dark').l)
    expect(oklch('--cg-footer', 'dark').l).toBeLessThan(oklch('--cg-canvas', 'dark').l)
  })

  it('draws hairlines a step up in lightness in the dark, and a step down on white', () => {
    expect(oklch('--cg-line', 'dark').l).toBeGreaterThan(oklch('--cg-canvas', 'dark').l)
    expect(oklch('--cg-line', 'light').l).toBeLessThan(oklch('--cg-canvas', 'light').l)
  })

  it('lifts the accent to a light tint of its own hue', () => {
    expect(oklch('--cg-accent', 'dark').l).toBeGreaterThan(oklch('--cg-accent', 'light').l + 0.25)
    expect(Math.abs(oklch('--cg-accent', 'dark').h - oklch('--cg-accent', 'light').h)).toBeLessThan(
      4,
    )
  })

  it('turns the primary button light with dark words', () => {
    expect(oklch('--cg-action', 'dark').l).toBeGreaterThan(0.85)
    expect(oklch('--cg-action-fg', 'dark').l).toBeLessThan(0.25)
  })

  it('keeps a loud accent readable as link text on paper by capping its lightness, not its hue', () => {
    const orange = variablesFor(FOREIGN_SKINS['a white skin with a loud orange accent'] ?? {})
    const skinAccent = toOklch(evaluate('#ff4f00', { scheme: 'light', variables: orange }))
    const link = oklch('--cg-accent', 'light', orange)
    expect(link.l).toBeLessThanOrEqual(0.51)
    // sRGB gamut mapping of a saturated orange moves the hue a few degrees.
    expect(Math.abs(link.h - skinAccent.h)).toBeLessThan(12)
    // The default deep blue is already darker than the cap, so it passes unchanged.
    const blue = toOklch(
      evaluate(String(skin.color?.accent), { scheme: 'light', variables: DEFAULT_VARIABLES }),
    )
    expect(oklch('--cg-accent', 'light').l).toBeCloseTo(blue.l, 2)
  })

  it('dims photographs a step in the dark, with brightness and never a blur', () => {
    expect(TOKENS_CODE).toMatch(/\[data-theme="dark"\]\)\s*\{\s*--cg-image-brightness:\s*0\.9/)
    expect(CODE).toMatch(
      /:where\(img, video\)\s*\{[^}]*filter:\s*brightness\(var\(--cg-image-brightness\)\)/,
    )
  })

  it('turns wordmarks drawn in ink light in the dark, so a partner stays legible', () => {
    expect(TOKENS_CODE).toMatch(/\[data-theme="dark"\]\)\s*\{[^}]*--cg-mark-invert:\s*1/)
    expect(rule('.cg-logo__image,\n.cg-logo-strip__image')).toMatch(
      /filter:\s*grayscale\(1\) invert\(var\(--cg-mark-invert\)\)/,
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
    // Without the guard, a browser that cannot parse `light-dark()` still
    // stores the custom property and only fails when it is *used* — leaving
    // the page with no colour at all rather than with the light palette.
    expect(tokens).toMatch(/@supports \(color: light-dark\(/)
    const before = tokens.slice(0, tokens.indexOf('@supports (color:'))
    for (const property of [
      '--cg-canvas',
      '--cg-band',
      '--cg-footer',
      '--cg-ink',
      '--cg-accent',
      '--cg-action',
      '--cg-line',
    ]) {
      expect(before, `${property} needs a pre-@supports fallback`).toContain(`${property}:`)
    }
  })

  it('swaps the light and dark toggle icons in both directions', () => {
    expect(CODE).toMatch(
      /\[data-theme="dark"\]\) \.cg-theme-toggle__icon--sun\s*\{\s*display:\s*none/,
    )
    expect(CODE).toMatch(
      /prefers-color-scheme: dark\)[\s\S]*\.cg-theme-toggle__icon--moon\s*\{\s*display:\s*block/,
    )
  })
})

describe('the motion, depth and colour rules of the charter', () => {
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
    expect(transitions.length).toBeGreaterThan(5)
    for (const value of transitions) expect(value).toContain('var(--cg-duration)')
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
    expect(hoverRules.length).toBeGreaterThan(15)
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

  it('casts no shadow at all, on a photograph or anywhere else', () => {
    expect(CODE).not.toMatch(/box-shadow|drop-shadow|text-shadow/)
    expect(ALL_CSS).not.toMatch(/--cogenta-shadow-/)
  })

  it('draws no gradient, no blur, no translucency and no frosted glass', () => {
    expect(CODE).not.toMatch(/gradient\(|backdrop-filter|blur\(|opacity\s*:/)
  })

  it('draws no decorative shape: every pseudo-element with content is a character or a quotation mark', () => {
    const pseudos = blocks().filter(({ selector }) => /::(before|after)/.test(selector))
    expect(pseudos.length).toBeGreaterThan(5)
    for (const { selector, body } of pseudos) {
      const content = /content:\s*([^;]+);/.exec(body)?.[1]?.trim()
      if (content === undefined) continue
      expect(content, selector).not.toBe('""')
    }
  })

  it('keeps corners square on photographs and softens only controls, by a hair; portraits are round', () => {
    const radii = blocks().flatMap(({ selector, body }) =>
      [...body.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => ({
        selector,
        value: (m[1] as string).trim(),
      })),
    )
    expect(radii.length).toBeGreaterThan(5)
    for (const { selector, value } of radii) {
      if (value === '50%') {
        expect(selector).toMatch(/__avatar$/)
        continue
      }
      expect(value, selector).toBe('var(--cg-radius-control)')
      expect(selector).not.toMatch(/image|__media|figure|cover|gallery/)
    }
    expect(CG.get('--cg-radius-control')).toMatch(/min\(var\(--cogenta-radius-sm\), 0\.25rem\)/)
  })

  it('paints bands and controls only in the palette’s neutral roles, never in the accent', () => {
    for (const { selector, body } of blocks()) {
      const background = /(?:^|;)\s*background:\s*([^;]+);/.exec(body)?.[1]?.trim()
      if (background === undefined) continue
      expect(
        [
          'var(--cg-canvas)',
          'var(--cg-band)',
          'var(--cg-footer)',
          'var(--cg-action)',
          'var(--cg-action-hover)',
          'var(--cg-selection)',
          'transparent',
        ],
        selector,
      ).toContain(background)
    }
  })

  it('keeps the accent to links, their hover, the focus ring and nothing that fills a surface', () => {
    const uses = blocks().flatMap(({ selector, body }) =>
      [...body.matchAll(/([a-z-]+)\s*:\s*[^;{}]*var\(--cg-accent(?:-hover)?\)[^;{}]*;/g)].map(
        (m) => ({ selector, property: m[1] as string }),
      ),
    )
    expect(uses.length).toBeGreaterThan(5)
    for (const { selector, property } of uses) {
      expect(['color', 'outline'], selector).toContain(property)
    }
  })

  it('sets a primary action in ink, so no accent a skin picks decides whether a button is legible', () => {
    expect(rule('.cg-action[data-emphasis="primary"]')).toMatch(/background:\s*var\(--cg-action\)/)
    expect(CG.get('--cg-action')).toMatch(/^light-dark\( var\(--cogenta-color-fg\)/)
  })

  it('draws every arrow link as inline content under one continuous underline, the arrow never alone', () => {
    const arrow = rule('.cg-action[data-emphasis="secondary"],\n.cg-arrow-link')
    expect(arrow).toMatch(/display:\s*inline-block/)
    expect(arrow).toMatch(/text-decoration-line:\s*underline/)
    expect(CODE).not.toMatch(/\.cg-arrow-link\s*\{[^}]*display:\s*(inline-)?flex/)
    expect(rule('.cg-action[data-emphasis="secondary"]')).toMatch(/white-space:\s*nowrap/)
    expect(rule('.cg-arrow-link__end')).toMatch(/white-space:\s*nowrap/)
    expect(CODE).toMatch(
      /\.cg-action\[data-emphasis="secondary"\]::after,\s*\.cg-arrow-link__end::after\s*\{\s*content:\s*"\\2192" \/ "";\s*display:\s*inline-block/,
    )
  })

  it('never uppercases a label or tracks it out', () => {
    expect(CODE).not.toMatch(/text-transform:\s*uppercase|font-variant-caps:\s*all-small-caps/)
    const tracked = [...CODE.matchAll(/letter-spacing:\s*([^;]+);/g)].map((m) =>
      (m[1] as string).trim(),
    )
    for (const value of tracked) expect(value).toMatch(/^var\(--cg-tracking-(display|heading)\)$/)
  })
})

describe('the typography', () => {
  it('holds the reading measure between 60 and 75 characters', () => {
    const measure = Number(CG.get('--cg-measure')?.replace('ch', ''))
    expect(measure).toBeGreaterThanOrEqual(60)
    expect(measure).toBeLessThanOrEqual(75)
    expect(rule('.cg-prose > *')).toMatch(/max-inline-size:\s*var\(--cg-measure\)/)
  })

  it('balances headings and wraps paragraphs without orphans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*text-wrap:\s*balance/)
    expect(CODE).toMatch(/p, li, dd, figcaption, blockquote\)\s*\{[^}]*text-wrap:\s*pretty/)
  })

  it('quotes with real quotation marks, and hangs the opening one on a wide screen', () => {
    expect(rule('.cg-quote__text')).toMatch(/quotes:\s*"\\201C" "\\201D"/)
    expect(rule('.cg-testimonial__quote')).toMatch(/quotes:\s*"\\201C" "\\201D"/)
    expect(CODE).toMatch(
      /min-width: 64rem\)[\s\S]*\.cg-quote__text p\s*\{\s*text-indent:\s*-0\.42em/,
    )
  })

  it('sets running text and every heading in the text face, and the page’s display line in the serif', () => {
    expect(rule('body')).toMatch(/font-family:\s*var\(--cg-font-text\)/)
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-family:\s*var\(--cg-font-text\)/)
    for (const selector of [
      '.cg-hero__title',
      '.cg-page__title',
      '.cg-entry-header__title',
      '.cg-quote__text',
    ]) {
      expect(rule(selector), selector).toMatch(/font-family:\s*var\(--cg-font-display\)/)
    }
    const display = blocks().filter(({ body }) => body.includes('var(--cg-font-display)'))
    expect(display.length).toBeLessThanOrEqual(7)
  })

  it('never lets the browser fake a weight or an italic the fonts do not have', () => {
    expect(rule('body')).toMatch(/font-synthesis:\s*none/)
  })

  it('tightens large type, without letting letters touch', () => {
    for (const property of ['--cg-tracking-display', '--cg-tracking-heading']) {
      const tracking = Number.parseFloat(CG.get(property) ?? '0')
      expect(tracking, property).toBeLessThan(0)
      expect(tracking, property).toBeGreaterThan(-0.03)
    }
  })

  it('sets dates, prices and figures in tabular numerals', () => {
    for (const selector of [
      ':where(data, time)',
      '.cg-stat__value',
      '.cg-stat-counter__value',
      '.cg-pricing__amount',
      '.cg-entry-header__meta',
      '.cg-site-footer__copyright',
    ]) {
      expect(rule(selector), selector).toMatch(/tabular-nums/)
    }
  })

  it('floors the smallest text the theme sets, whatever the skin’s ratio', () => {
    expect(CG.get('--cg-text-label')).toMatch(/max\(var\(--cg-text-xs\), 0\.8125rem\)/)
  })

  it('styles a photograph with nothing but its crop', () => {
    const imageRules = blocks().filter(({ selector }) =>
      /__image\b|__media\b|__cover/.test(selector),
    )
    expect(imageRules.length).toBeGreaterThan(5)
    for (const { selector, body } of imageRules) {
      expect(body, selector).not.toMatch(/shadow|blur|opacity|transform|radius/)
    }
  })
})

describe('the grid, the rhythm and the chrome', () => {
  it('lays blocks on twelve columns with constant gutters and an explicit page width', () => {
    expect(CG.get('--cg-columns')).toBe('12')
    expect(CG.get('--cg-page')).toMatch(/rem$/)
    expect(CODE.match(/\.cg-grid,[^{]*\{([^}]*)\}/)?.[1]).toMatch(
      /grid-template-columns:\s*repeat\(var\(--cg-columns\), minmax\(0, 1fr\)\)/,
    )
    expect(CG.get('--cg-inset')).toBe('max(var(--cg-gutter), calc((100% - var(--cg-page)) / 2))')
  })

  it('spaces every block with the one section rhythm', () => {
    expect(rule('.cg-block')).toMatch(/padding-block:\s*calc\(var\(--cg-section\) \/ 2\)/)
    expect(rule('.cg-block')).toMatch(/padding-inline:\s*var\(--cg-inset\)/)
  })

  it('opens a titled section under one rule in ink, from the first column', () => {
    const title = CODE.match(/\.cg-section-title,[^{]*\{([^}]*)\}/)?.[1]
    expect(title).toMatch(/border-block-start:\s*var\(--cg-rule\) solid var\(--cg-ink\)/)
  })

  it('lets a band variant reach both edges of the window', () => {
    expect(
      rule(
        '[data-block][data-variant-background="muted"],\n[data-block][data-variant-background="image"]',
      ),
    ).toMatch(/background:\s*var\(--cg-band\)/)
  })

  it('keeps the header on the page’s own ground, under a hairline, and lets it scroll away', () => {
    const header = rule('.cg-site-header')
    expect(header).toMatch(/position:\s*relative/)
    expect(header).toMatch(/background:\s*var\(--cg-canvas\)/)
    expect(header).toMatch(/border-block-end:\s*var\(--cg-rule\) solid var\(--cg-line\)/)
  })

  it('opens the phone menu with the checkbox alone, no script', () => {
    expect(CODE).toMatch(/\.cg-nav-toggle:checked ~ \.cg-site-header__nav\s*\{\s*display:\s*block/)
    expect(CODE).toMatch(/\.cg-nav-toggle:focus-visible \+ \.cg-nav-toggle__label\s*\{\s*outline:/)
  })

  it('shows the menu control only below the wide breakpoint, and exactly one header action at every width', () => {
    const wide = CODE.slice(CODE.indexOf('@media (min-width: 56rem)'))
    expect(wide).toMatch(/\.cg-nav-toggle,\s*\.cg-nav-toggle__label\s*\{\s*display:\s*none/)
    expect(wide).toMatch(/\.cg-site-header__menu-action\s*\{\s*display:\s*none/)
    expect(
      rule('.cg-site-header[data-nav="links"] .cg-site-header__end .cg-site-header__action'),
    ).toMatch(/display:\s*none/)
  })

  it('ends the page on the footer band, its legal line under a hairline', () => {
    expect(rule('.cg-site-footer')).toMatch(/background:\s*var\(--cg-footer\)/)
    expect(rule('.cg-site-footer__legal')).toMatch(
      /border-block-start:\s*var\(--cg-rule\) solid var\(--cg-line\)/,
    )
  })

  it('crops photographs to one ratio per context', () => {
    expect(rule('.cg-hero__image,\n.cg-hero__media video')).toMatch(/aspect-ratio:\s*3 \/ 2/)
    expect(rule('.cg-entry__image')).toMatch(/aspect-ratio:\s*3 \/ 2/)
    expect(rule('.cg-entry-header__cover img,\n.cg-entry-header__cover video')).toMatch(
      /aspect-ratio:\s*3 \/ 2/,
    )
  })

  it('lines the plans of a pricing table up row by row, from one subgrid', () => {
    expect(rule('.cg-pricing__tier')).toMatch(/grid-template-rows:\s*subgrid/)
    for (const [selector, row] of [
      ['.cg-pricing__head', 1],
      ['.cg-pricing__price', 2],
      ['.cg-pricing__features', 3],
      ['.cg-pricing__action', 4],
    ] as const) {
      expect(rule(selector), selector).toMatch(new RegExp(`grid-row:\\s*${row};`))
    }
  })

  it('cuts one entry of a carousel at the edge, so the row says it scrolls', () => {
    expect(CODE).toMatch(
      /grid-auto-columns:\s*calc\(\(100% - 3 \* var\(--cg-column-gap\)\) \/ 3\.4\)/,
    )
  })

  it('gives a symbol it has no glyph for no room at all, never an empty square above a title', () => {
    expect(rule('.cg-feature__icon:empty')).toMatch(/display:\s*none/)
  })

  it('leaves no empty column at the end of a row of two, three or four', () => {
    expect(CODE).toMatch(/\.cg-feature:first-child:nth-last-child\(2\)/)
    expect(CODE).toMatch(/\.cg-stat:first-child:nth-last-child\(3\)/)
    expect(CODE).toMatch(/\.cg-logo:first-child:nth-last-child\(4\)/)
    expect(CODE).toMatch(/\.cg-pricing__tier:first-child:nth-last-child\(2\)/)
    expect(CODE).toMatch(
      /\.cg-collection\[data-layout="grid"\] \.cg-entry:first-child:nth-last-child\(4\)/,
    )
  })
})
