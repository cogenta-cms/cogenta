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
  'listings.css',
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
  ...Object.entries(skin).flatMap(([group, values]) =>
    Object.keys(values).map((name) => `--cogenta-${group}-${kebab(name)}`),
  ),
  '--cogenta-space-scale',
  ...TYPE_SCALE_STEPS.map((step) => `--cogenta-font-size-${step}`),
])

function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/(--ca-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1] as string
    const value = (match[2] as string).replace(/\s+/g, ' ').trim()
    if (!found.has(name) || value.includes('light-dark(')) found.set(name, value)
  }
  return found
}

const CA = declarations((SOURCES.get('tokens.css') as string).replace(/\/\*[\s\S]*?\*\//g, ''))

const VARIABLES = new Map<string, string>([
  ...[...CA].map(([name, value]) => [name, value] as const),
  ...Object.entries(skin.color ?? {}).map(
    ([name, value]) => [`--cogenta-color-${kebab(name)}`, String(value)] as const,
  ),
])

function color(property: string, scheme: Scheme): Srgb {
  const declared = CA.get(property)
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
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--ca-[a-z0-9-]+)\s*(,?)/g)]
      .filter((match) => match[2] === '')
      .map((match) => match[1] as string)
    const missing = [...new Set(referenced)].filter((name) => !CA.has(name))
    expect(missing).toEqual([])
  })
})

/**
 * Contract D validates three pairs on the skin itself. These are the pairs
 * the theme invents on top of it, every one of them used for text.
 */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--ca-ink', '--ca-canvas'],
  ['--ca-ink', '--ca-band'],
  ['--ca-ink', '--ca-raised'],
  ['--ca-ink-muted', '--ca-canvas'],
  ['--ca-ink-muted', '--ca-band'],
  ['--ca-ink-subtle', '--ca-canvas'],
  ['--ca-ink-subtle', '--ca-band'],
  ['--ca-green', '--ca-canvas'],
  ['--ca-green', '--ca-band'],
  ['--ca-green-fg', '--ca-green'],
  ['--ca-action-fg', '--ca-action'],
  ['--ca-action-hover-fg', '--ca-action-hover'],
  ['--ca-signal-ink', '--ca-signal'],
  ['--ca-signal-ink', '--ca-signal-hover'],
  ['--ca-signal', '--ca-signal-ink'],
  ['--ca-footer-ink', '--ca-footer'],
  ['--ca-footer-muted', '--ca-footer'],
]

for (const scheme of ['light', 'dark'] as const) {
  describe(`the ${scheme} palette`, () => {
    for (const [foreground, background] of TEXT_PAIRS) {
      it(`reaches AA body contrast for ${foreground} on ${background}`, () => {
        const ratio = contrast(color(foreground, scheme), color(background, scheme))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('draws a focus ring in the green that stands out from the ground (WCAG 1.4.11)', () => {
      expect(contrast(color('--ca-green', scheme), color('--ca-canvas', scheme))).toBeGreaterThan(3)
    })

    it('draws a strong line that separates from the ground, and a hairline that stays quieter', () => {
      const strong = contrast(color('--ca-line-strong', scheme), color('--ca-canvas', scheme))
      const hairline = contrast(color('--ca-line', scheme), color('--ca-canvas', scheme))
      expect(strong).toBeGreaterThanOrEqual(2.2)
      expect(hairline).toBeGreaterThan(1.15)
      expect(hairline).toBeLessThan(strong)
    })

    it('draws a share bar that reads against its track, and a track that reads against the ground', () => {
      expect(contrast(color('--ca-green', scheme), color('--ca-track', scheme))).toBeGreaterThan(3)
      expect(contrast(color('--ca-track', scheme), color('--ca-canvas', scheme))).toBeGreaterThan(
        1.05,
      )
    })

    it('draws a rule that shows on the footer band and on the yellow band', () => {
      expect(
        contrast(color('--ca-footer-line', scheme), color('--ca-footer', scheme)),
      ).toBeGreaterThan(1.3)
      expect(
        contrast(color('--ca-signal-line', scheme), color('--ca-signal', scheme)),
      ).toBeGreaterThan(1.5)
    })

    it('sets a band apart from the page, gently', () => {
      const ratio = contrast(color('--ca-band', scheme), color('--ca-canvas', scheme))
      expect(ratio).toBeGreaterThan(1.05)
      expect(ratio).toBeLessThan(1.5)
    })
  })
}

describe('the yellow', () => {
  const oklch = (property: string, scheme: Scheme) => toOklch(color(property, scheme))

  it('is a real signal yellow taken from the paper’s own hue, not a mustard or an orange', () => {
    const { l, c, h } = oklch('--ca-signal', 'light')
    expect(l).toBeGreaterThan(0.8)
    expect(c).toBeGreaterThan(0.14)
    expect(h).toBeGreaterThan(75)
    expect(h).toBeLessThan(95)
  })

  it('stays the same yellow in the dark, with ink words on it', () => {
    expect(Math.abs(oklch('--ca-signal', 'dark').h - oklch('--ca-signal', 'light').h)).toBeLessThan(
      3,
    )
    expect(oklch('--ca-signal-ink', 'dark').l).toBeLessThan(0.25)
  })

  it('stands out from both grounds as a fill', () => {
    expect(contrast(color('--ca-signal', 'dark'), color('--ca-canvas', 'dark'))).toBeGreaterThan(7)
  })

  it('falls back to the organisation’s green where relative colour is not supported', () => {
    const tokens = SOURCES.get('tokens.css') as string
    const plain = tokens.slice(0, tokens.indexOf('@supports (color:'))
    expect(plain).toMatch(/--ca-signal:\s*var\(--cogenta-color-accent\)/)
  })

  it('is kept for the donation ask: the header action, the hero’s first action and the ask band', () => {
    const uses = blocks().flatMap(({ selector, body }) =>
      [
        ...body.matchAll(
          /(background|border-color|border|color):\s*[^;{}]*var\(--ca-signal\)[^;{}]*;/g,
        ),
      ].map((m) => ({ selector, property: m[1] as string })),
    )
    expect(uses.length).toBeGreaterThanOrEqual(3)
    for (const { selector } of uses) {
      expect(selector).toMatch(/ca-header__action|\.ca-ask|\.ca-cta/)
    }
  })
})

describe('the dark palette is designed, not inverted', () => {
  const oklch = (property: string, scheme: Scheme) => toOklch(color(property, scheme))

  it('grounds the page in a deep green-black taken from the green, never pure black', () => {
    const { l, c, h } = oklch('--ca-canvas', 'dark')
    expect(l).toBeGreaterThan(0.17)
    expect(l).toBeLessThan(0.26)
    expect(c).toBeGreaterThan(0.008)
    expect(h).toBeGreaterThan(140)
    expect(h).toBeLessThan(180)
  })

  it('sets type in the paper’s own warm white, a step below white', () => {
    const { l } = oklch('--ca-ink', 'dark')
    expect(l).toBeGreaterThan(0.88)
    expect(l).toBeLessThan(0.97)
  })

  it('lifts the green to a pale sage for the dark ground, keeping its hue', () => {
    expect(oklch('--ca-green', 'dark').l).toBeGreaterThan(oklch('--ca-green', 'light').l + 0.3)
    expect(Math.abs(oklch('--ca-green', 'dark').h - oklch('--ca-green', 'light').h)).toBeLessThan(4)
  })

  it('expresses depth as a lightness step up from the ground: canvas, band, raised', () => {
    expect(oklch('--ca-band', 'dark').l).toBeGreaterThan(oklch('--ca-canvas', 'dark').l)
    expect(oklch('--ca-raised', 'dark').l).toBeGreaterThan(oklch('--ca-band', 'dark').l)
  })

  it('draws a rule as a step up in lightness in the dark, and a step down on paper', () => {
    expect(oklch('--ca-line', 'dark').l).toBeGreaterThan(oklch('--ca-canvas', 'dark').l)
    expect(oklch('--ca-line', 'light').l).toBeLessThan(oklch('--ca-canvas', 'light').l)
  })

  it('turns the filled green button sage with dark words', () => {
    expect(oklch('--ca-action', 'dark').l).toBeGreaterThan(0.7)
    expect(oklch('--ca-action-fg', 'dark').l).toBeLessThan(0.25)
  })

  it('ends every page on its heaviest band: green on paper, below the ground in the dark', () => {
    expect(oklch('--ca-footer', 'light').l).toBeLessThan(0.5)
    expect(oklch('--ca-footer', 'dark').l).toBeLessThan(oklch('--ca-canvas', 'dark').l)
  })

  it('dims photographs in the dark with a brightness step, never a blur', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/\[data-theme="dark"\]\)\s*\{\s*--ca-image-brightness:\s*0\.9/)
    expect(SOURCES.get('base.css')).toMatch(/filter:\s*brightness\(var\(--ca-image-brightness\)\)/)
  })

  it('inverts wordmarks drawn in ink in the dark, so a partner stays legible', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/\[data-theme="dark"\]\)\s*\{[^}]*--ca-mark-invert:\s*1/)
    expect(rule('.ca-mark')).toMatch(/filter:\s*grayscale\(1\) invert\(var\(--ca-mark-invert\)\)/)
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
    for (const property of [
      '--ca-canvas',
      '--ca-ink',
      '--ca-green',
      '--ca-signal',
      '--ca-footer',
    ]) {
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
    expect(CA.get('--ca-duration')).toMatch(/min\(var\(--cogenta-motion-duration\), 150ms\)/)
    const literal = [...CODE.matchAll(/transition[^;]*?(\d+(?:\.\d+)?)(ms|s)\b/g)].map((match) =>
      match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]),
    )
    expect(literal.every((ms) => ms <= 150)).toBe(true)
  })

  it('removes every transition under prefers-reduced-motion, through the same token', () => {
    expect(CODE).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--ca-duration:\s*0ms;/,
    )
    const transitions = [...CODE.matchAll(/transition\s*:([^;]*);/g)].map((m) => m[1] as string)
    expect(transitions.length).toBeGreaterThan(3)
    for (const value of transitions) expect(value).toContain('var(--ca-duration)')
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
    const hoverRules = [...CODE.matchAll(/:hover[^{]*\{([^}]*)\}/g)].map((m) => m[1] as string)
    expect(hoverRules.length).toBeGreaterThan(8)
    for (const body of hoverRules) {
      expect(body).not.toMatch(
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

  it('draws no decorative shape: no pseudo-element that is only a box, except the accordion’s plus', () => {
    const shapes = blocks().filter(
      ({ selector, body }) => /::(before|after)/.test(selector) && /content:\s*""/.test(body),
    )
    for (const { selector } of shapes) expect(selector).toMatch(/ca-notes__mark/)
  })

  it('keeps corners square on photographs and softens only controls, by a hair', () => {
    const radii = blocks().flatMap(({ selector, body }) =>
      [...body.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => ({
        selector,
        value: (m[1] as string).trim(),
      })),
    )
    expect(radii.length).toBeGreaterThan(3)
    for (const { selector, value } of radii) {
      expect(['var(--ca-radius-control)', 'var(--ca-radius)', '0'], selector).toContain(value)
      expect(selector).not.toMatch(/image|photo|avatar|portrait|figure/)
    }
  })

  it('never paints a band or a card in a colour outside the palette’s roles', () => {
    for (const { selector, body } of blocks()) {
      const background = /(?:^|;)\s*background:\s*([^;]+);/.exec(body)?.[1]?.trim()
      if (background === undefined) continue
      expect(
        [
          'var(--ca-canvas)',
          'var(--ca-band)',
          'var(--ca-track)',
          'var(--ca-green)',
          'var(--ca-footer)',
          'var(--ca-action)',
          'var(--ca-action-hover)',
          'var(--ca-signal)',
          'var(--ca-signal-hover)',
          'var(--ca-signal-ink)',
          'var(--ca-ink)',
          'var(--ca-line)',
          'transparent',
        ],
        selector,
      ).toContain(background)
    }
  })

  it('keeps the green to links, figures, focus, bars, the filled button and the footer band', () => {
    const fills = blocks().filter(({ body }) =>
      /(?:^|;)\s*background:\s*var\(--ca-green\)/.test(body),
    )
    for (const { selector } of fills) expect(selector).toMatch(/selection|shares__bar|notes__mark/)
  })

  it('draws every arrow link as inline content, its arrow on a word that cannot break', () => {
    expect(rule('.cg-action[data-emphasis="secondary"],\n.ca-arrow-link')).toMatch(
      /text-decoration-line:\s*underline/,
    )
    expect(CODE).not.toMatch(/\.ca-arrow-link\s*\{[^}]*display:\s*(inline-)?flex/)
    expect(rule('.ca-arrow-link__end,\n.ca-arrow-link__start')).toMatch(/white-space:\s*nowrap/)
    expect(CODE).toMatch(
      /\.ca-arrow-link__end::after\s*\{\s*content:\s*"\\2192" \/ "";\s*display:\s*inline-block/,
    )
  })

  it('sets capitals only on the month of a date block, the one label short enough to take them', () => {
    const upper = blocks().filter(({ body }) => /text-transform:\s*uppercase/.test(body))
    expect(upper.map(({ selector }) => selector)).toEqual(['.ca-date-month,\n.ca-when-month'])
  })

  it('tracks out nothing but those capitals', () => {
    for (const { selector, body } of blocks()) {
      if (!body.includes('var(--ca-tracking-caps)')) continue
      expect(selector).toMatch(/month/)
    }
    const literal = [...CODE.matchAll(/letter-spacing:\s*([^;]+);/g)]
      .map((m) => (m[1] as string).trim())
      .filter((value) => !value.startsWith('var('))
    for (const value of literal) expect(Number.parseFloat(value)).toBeLessThanOrEqual(0.02)
  })
})

describe('the typography', () => {
  it('holds the reading measure between 60 and 75 characters', () => {
    const measure = Number(CA.get('--ca-measure')?.replace('ch', ''))
    expect(measure).toBeGreaterThanOrEqual(60)
    expect(measure).toBeLessThanOrEqual(75)
  })

  it('balances headings and wraps paragraphs without orphans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*text-wrap:\s*balance/)
    expect(CODE).toMatch(/p, li, dd, figcaption, blockquote\)\s*\{[^}]*text-wrap:\s*pretty/)
  })

  it('hangs punctuation where the browser supports it, and quotes with real quotation marks', () => {
    expect(CODE).toMatch(/hanging-punctuation:\s*first/)
    expect(rule('.ca-quote__text')).toMatch(/quotes:\s*"\\201C" "\\201D"/)
    expect(CODE).toMatch(/\.ca-story__quote\s*\{[^}]*quotes:\s*"\\201C" "\\201D"/)
  })

  it('hangs an opening quotation mark into the margin on a wide screen only', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/--ca-hang:\s*0;/)
    expect(tokens).toMatch(
      /min-width: 64rem\)\s*\{\s*:where\(:root\)\s*\{\s*--ca-hang:\s*-0\.42em;/,
    )
  })

  it('sets headings in the display face with its optical size, and running text in the text face', () => {
    expect(CODE).toMatch(
      /h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-family:\s*var\(--ca-font-display\);\s*font-optical-sizing:\s*auto/,
    )
    expect(rule('body')).toMatch(/font-family:\s*var\(--ca-font-text\)/)
  })

  it('narrows and tightens the statement of the cause, without letting letters touch', () => {
    expect(rule('.ca-hero__title')).toMatch(/font-stretch:\s*var\(--ca-stretch-display\)/)
    expect(rule('.ca-hero__title')).toMatch(/letter-spacing:\s*var\(--ca-tracking-display\)/)
    const tracking = Number.parseFloat(CA.get('--ca-tracking-display') ?? '0')
    expect(tracking).toBeLessThan(0)
    expect(tracking).toBeGreaterThan(-0.03)
  })

  it('sets figures, amounts, days and years in tabular lining numerals', () => {
    for (const selector of [
      '.ca-figures__value,\n.ca-counter__value',
      '.ca-shares__value',
      '.ca-cta__amount',
      '.ca-levels__amount',
      '.ca-steps__number',
      '.ca-date-day,\n.ca-when-day',
      '.ca-footer__copyright',
      ':where(data, time)',
    ]) {
      expect(rule(selector), selector).toMatch(/tabular-nums/)
    }
  })

  it('styles a photograph with nothing but its crop and a brightness step', () => {
    const imageRules = [...CODE.matchAll(/__image[^{,]*\{([^}]*)\}/g)].map((m) => m[1] as string)
    expect(imageRules.length).toBeGreaterThan(5)
    for (const body of imageRules) expect(body).not.toMatch(/shadow|blur|opacity|transform|radius/)
  })
})

describe('the grid, the calendar and the rows', () => {
  it('lays every block on twelve columns with constant gutters and an explicit page width', () => {
    expect(CA.get('--ca-columns')).toBe('12')
    expect(CA.get('--ca-page')).toMatch(/rem$/)
    expect(rule('.ca-container')).toMatch(
      /grid-template-columns:\s*repeat\(var\(--ca-columns\), minmax\(0, 1fr\)\)/,
    )
  })

  it('spaces every block with the one section rhythm', () => {
    expect(rule('.ca-section')).toMatch(/padding-block:\s*calc\(var\(--ca-section\) \/ 2\)/)
  })

  it('sets the date block on the first two columns of a calendar row', () => {
    expect(rule('  .ca-list[data-layout="list"] .ca-date')).toMatch(/grid-column:\s*1 \/ span 2/)
  })

  it('alternates the side of a programme’s picture, row by row', () => {
    expect(CODE).toMatch(
      /\.ca-rows__item:nth-child\(even\) \.ca-rows__media\s*\{\s*grid-column:\s*9 \/ span 4/,
    )
  })

  it('crops photographs to one ratio per context', () => {
    expect(rule('.ca-rows__image')).toMatch(/aspect-ratio:\s*4 \/ 3/)
    expect(rule('  .ca-rows__image')).toMatch(/aspect-ratio:\s*4 \/ 5/)
    expect(rule('.ca-story__image')).toMatch(/aspect-ratio:\s*4 \/ 5/)
    expect(rule('.ca-event__image,\n.ca-entry__image')).toMatch(/aspect-ratio:\s*16 \/ 9/)
  })

  it('never floats the statement over the photograph: the sheet is paper, the words on it', () => {
    expect(rule('  .ca-hero[data-media="true"] .ca-hero__panel')).toMatch(
      /background:\s*var\(--ca-canvas\)/,
    )
    expect(CODE).not.toMatch(/\.ca-hero__[a-z]+\s*\{[^}]*position:\s*absolute/)
  })

  it('keeps the header on the page’s own ground, with a hairline, and lets it scroll away', () => {
    expect(rule('.ca-header')).toMatch(/position:\s*relative/)
    expect(rule('.ca-header')).toMatch(/background:\s*var\(--ca-canvas\)/)
    expect(rule('.ca-header')).toMatch(
      /border-block-end:\s*var\(--ca-rule\) solid var\(--ca-line\)/,
    )
  })

  it('opens the mobile menu with the checkbox alone, no script', () => {
    expect(CODE).toMatch(/\.ca-nav-toggle-input:checked ~ \.ca-header__nav\s*\{\s*display:\s*block/)
  })

  it('ends the page on the footer band', () => {
    expect(rule('.ca-footer')).toMatch(/background:\s*var\(--ca-footer\)/)
  })
})
