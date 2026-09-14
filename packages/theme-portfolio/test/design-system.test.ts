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
const SHEETS = ['tokens.css', 'base.css', 'work.css', 'blocks.css', 'archive.css'] as const

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
  ['--cg-ink-subtle', '--cg-canvas'],
  ['--cg-action-fg', '--cg-action'],
  ['--cg-action-hover-fg', '--cg-action-hover'],
  ['--cg-signal-fg', '--cg-signal'],
  ['--cg-line-ink', '--cg-canvas'],
  ['--cg-plate-ink', '--cg-plate'],
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
        contrast(color('--cg-signal', scheme), color('--cg-canvas', scheme)),
      ).toBeGreaterThanOrEqual(3)
    })

    it('separates a strong line from the surface it sits on', () => {
      const ratio = contrast(color('--cg-line-strong', scheme), color('--cg-surface', scheme))
      expect(ratio).toBeGreaterThanOrEqual(3)
    })

    it('keeps a hairline visible and quieter than the rule in ink', () => {
      const hairline = contrast(color('--cg-line', scheme), color('--cg-canvas', scheme))
      const heavy = contrast(color('--cg-line-ink', scheme), color('--cg-canvas', scheme))
      expect(hairline).toBeGreaterThan(1.2)
      expect(hairline).toBeLessThan(heavy)
    })

    it('sets a plate for marks apart from the page', () => {
      const ratio = contrast(color('--cg-plate', scheme), color('--cg-canvas', scheme))
      expect(ratio).toBeGreaterThan(1.05)
    })
  })
}

describe('the dark palette is designed, not inverted', () => {
  const lightness = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).l
  const hue = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).h

  it('shows the work on true black', () => {
    expect(lightness('--cg-canvas', 'dark')).toBeLessThan(0.02)
    expect(lightness('--cg-canvas', 'light')).toBeGreaterThan(0.98)
  })

  it('sets white type a step below pure white, so a long case study stays calm', () => {
    expect(lightness('--cg-ink', 'dark')).toBeGreaterThan(0.9)
    expect(lightness('--cg-ink', 'dark')).toBeLessThan(0.99)
  })

  it('keeps the signal exactly: the same orange on paper and on black', () => {
    expect(
      Math.abs(lightness('--cg-signal', 'dark') - lightness('--cg-signal', 'light')),
    ).toBeLessThan(0.01)
    expect(Math.abs(hue('--cg-signal', 'dark') - hue('--cg-signal', 'light'))).toBeLessThan(1)
  })

  it('expresses depth as a lightness step up from black: canvas, then sunken, then raised', () => {
    expect(lightness('--cg-surface-sunken', 'dark')).toBeGreaterThan(
      lightness('--cg-canvas', 'dark'),
    )
    expect(lightness('--cg-surface-raised', 'dark')).toBeGreaterThan(
      lightness('--cg-surface-sunken', 'dark'),
    )
  })

  it('draws a rule as a step up in lightness on black, and a step down on paper', () => {
    expect(lightness('--cg-line', 'dark')).toBeGreaterThan(lightness('--cg-canvas', 'dark'))
    expect(lightness('--cg-line', 'light')).toBeLessThan(lightness('--cg-canvas', 'light'))
  })

  it('keeps the plate for marks light on black, so a wordmark drawn for paper stays legible', () => {
    expect(lightness('--cg-plate', 'dark')).toBeGreaterThan(0.85)
  })

  it('flips the filled action to white on black, with black words', () => {
    expect(lightness('--cg-action', 'dark')).toBeGreaterThan(0.9)
    expect(lightness('--cg-action-fg', 'dark')).toBeLessThan(0.05)
  })

  it('dims pictures on black with a brightness step, never a blur', () => {
    const tokens = SOURCES.get('tokens.css') as string
    expect(tokens).toMatch(/\[data-theme="dark"\]\)\s*\{\s*--cg-image-brightness:\s*0\.92/)
    expect(SOURCES.get('base.css')).toMatch(/filter:\s*brightness\(var\(--cg-image-brightness\)\)/)
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
    for (const property of ['--cg-canvas', '--cg-ink', '--cg-signal', '--cg-plate']) {
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

/**
 * The studio charter (`docs/lots/L27`): motion is a colour or an underline
 * changing, nothing lifts, nothing fades in on scroll, a picture never casts
 * a shadow, and one signal colour appears in a couple of details only.
 */
describe('the motion, depth and colour rules', () => {
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

  it('never moves or scales an element on hover', () => {
    const hoverRules = [...CODE.matchAll(/:hover[^{]*\{([^}]*)\}/g)].map(
      (match) => match[1] as string,
    )
    expect(hoverRules.length).toBeGreaterThan(8)
    for (const body of hoverRules) {
      expect(body).not.toMatch(/transform|translate|box-shadow|scale|rotate|margin|inset/)
    }
  })

  it('declares no keyframes, no entrance animation and no scroll-driven animation', () => {
    expect(CODE).not.toMatch(
      /@keyframes|animation\s*:|animation-name|animation-timeline|view-timeline|scroll-timeline/,
    )
  })

  it('casts no shadow at all, on a picture or anywhere else', () => {
    expect(CODE.replace(/box-shadow:\s*inset[^;]*;/g, '')).not.toMatch(/box-shadow|drop-shadow/)
    expect(ALL_CSS).not.toMatch(/--cogenta-shadow-/)
  })

  it('keeps corners square: no pill and no radius beyond the skin’s own', () => {
    const radii = [...CODE.matchAll(/border-radius:\s*([^;]+);/g)].map((m) =>
      (m[1] as string).trim(),
    )
    expect(radii.length).toBeGreaterThan(2)
    for (const value of radii) {
      expect(['var(--cg-radius)', 'var(--cg-radius-control)', '0']).toContain(value)
    }
  })

  it('keeps the signal to details: a focus ring, a selection and the underline of the contact line', () => {
    const uses = [...CODE.matchAll(/([a-z-]+)\s*:\s*[^;{}]*var\(--cg-signal\)[^;{}]*;/g)].map(
      (match) => match[1] as string,
    )
    expect(uses.length).toBeGreaterThan(0)
    expect(uses.length).toBeLessThanOrEqual(5)
    for (const property of uses) {
      expect(['outline', 'background', 'text-decoration-color']).toContain(property)
    }
    expect(CODE).not.toMatch(/(?:^|[;{\s])color:\s*var\(--cg-signal\)/)
    expect(rule('.cg-action.cg-contact__link')).toMatch(
      /text-decoration-color:\s*var\(--cg-signal\)/,
    )
  })

  it('draws every arrow link as inline content, so its words carry one continuous underline', () => {
    const arrow = CODE.match(
      /\.cg-action\[data-emphasis="secondary"\],\s*\.cg-arrow-link\s*\{([^}]*)\}/,
    )?.[1]
    expect(arrow).toBeDefined()
    expect(arrow).toMatch(/display:\s*inline-block/)
    expect(arrow).not.toMatch(/display:\s*(inline-)?flex/)
    expect(CODE).toMatch(
      /\.cg-arrow-link::after\s*\{\s*content:\s*"\\2192" \/ "";\s*display:\s*inline-block/,
    )
  })

  it('separates with space and hairlines, never with a coloured box behind a card', () => {
    expect(rule('.cg-work')).not.toMatch(/background|border:/)
    expect(rule('.cg-list__items')).not.toMatch(/background/)
    expect(CODE).not.toMatch(/\.cg-work:hover\s*\{/)
  })
})

describe('the studio typography', () => {
  it('holds the reading measure between 60 and 75 characters', () => {
    const measure = Number(CG.get('--cg-measure')?.replace('ch', ''))
    expect(measure).toBeGreaterThanOrEqual(60)
    expect(measure).toBeLessThanOrEqual(75)
  })

  it('sets everything in the one family the skin names', () => {
    expect(CG.get('--cg-font')).toBe('var(--cogenta-font-sans)')
    expect(CODE).toMatch(/body\s*\{[^}]*font-family:\s*var\(--cg-font\)/)
    expect(CODE).toMatch(
      /:where\(h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-family:\s*var\(--cg-font\)/,
    )
    expect(CODE).not.toMatch(/--cogenta-font-serif/)
  })

  it('balances headings and wraps paragraphs without orphans', () => {
    expect(CODE).toMatch(/h1, h2, h3, h4, h5, h6\)\s*\{[^}]*text-wrap:\s*balance/)
    expect(CODE).toMatch(/p, li, dd, figcaption, blockquote\)\s*\{[^}]*text-wrap:\s*pretty/)
  })

  it('hangs punctuation where the browser supports it, and quotes with real quotation marks', () => {
    expect(CODE).toMatch(/hanging-punctuation:\s*first/)
    expect(rule('.cg-quote__quote')).toMatch(/quotes:\s*"\\201C" "\\201D"/)
  })

  it('sets figures in tabular lining numerals wherever numbers are compared', () => {
    for (const selector of [
      '.cg-figures__value',
      '.cg-fees__amount',
      '.cg-tally__value',
      '.cg-index__cell',
      '.cg-work__caption',
      '.cg-facts__list',
      '.cg-colophon__copyright',
    ]) {
      expect(rule(selector), selector).toMatch(/tabular-nums/)
    }
  })

  it('tightens the tracking of the display sizes, without letting letters touch', () => {
    const tracking = Number.parseFloat(CG.get('--cg-tracking-display') ?? '0')
    expect(tracking).toBeLessThan(0)
    expect(tracking).toBeGreaterThan(-0.03)
  })

  it('never uppercases a label or tracks it out: the section labels are words at the caption size', () => {
    expect(CODE).not.toMatch(/text-transform:\s*uppercase/)
    expect(rule('.cg-head__title')).toMatch(/font-size:\s*var\(--cg-text-caption\)/)
  })

  it('never styles a picture with anything but its crop and a brightness step', () => {
    const imageRules = [...CODE.matchAll(/__image[^{]*\{([^}]*)\}/g)].map((m) => m[1] as string)
    expect(imageRules.length).toBeGreaterThan(5)
    for (const body of imageRules) expect(body).not.toMatch(/shadow|blur|opacity|transform|radius/)
  })
})

describe('the grid', () => {
  it('lays every block on twelve columns with constant gutters and an explicit page width', () => {
    expect(CG.get('--cg-columns')).toBe('12')
    expect(CG.get('--cg-page')).toMatch(/rem$/)
    expect(rule('.cg-container')).toMatch(
      /grid-template-columns:\s*repeat\(var\(--cg-columns\), minmax\(0, 1fr\)\)/,
    )
  })

  it('spaces every block with the one section rhythm', () => {
    expect(rule('.cg-section')).toMatch(/padding-block:\s*calc\(var\(--cg-section\) \/ 2\)/)
  })

  it('sets the work grid as six asymmetric places: large and small, dropped, full width', () => {
    const work = SOURCES.get('work.css') as string
    expect(work).toMatch(/\[data-place="1"\]\s*\{\s*grid-column:\s*1 \/ span 7/)
    expect(work).toMatch(
      /\[data-place="2"\]\s*\{\s*grid-column:\s*9 \/ span 4;\s*margin-block-start/,
    )
    expect(work).toMatch(
      /\[data-place="4"\]\s*\{\s*grid-column:\s*1 \/ span 4;\s*margin-block-start/,
    )
    expect(work).toMatch(/\[data-place="5"\]\s*\{\s*grid-column:\s*6 \/ span 7/)
    expect(work).toMatch(
      /:is\(\[data-place="3"\], \[data-place="6"\]\) \.cg-work__media\s*\{\s*aspect-ratio:\s*2 \/ 1/,
    )
  })

  it('keeps every cover at one shape, square-cornered and cropped from the middle', () => {
    expect(rule('.cg-work__media')).toMatch(/aspect-ratio:\s*3 \/ 2/)
    expect(rule('.cg-work__image')).toMatch(/object-fit:\s*cover/)
    expect(rule('.cg-work__media')).not.toMatch(/radius/)
  })

  it('sets a long case study in two columns on a wide screen, and a short one in one', () => {
    const work = SOURCES.get('work.css') as string
    expect(work).toMatch(
      /\.cg-project \.cg-prose\[data-length="long"\] \.cg-prose__body\s*\{\s*columns:\s*2/,
    )
    expect(work).not.toMatch(/\[data-length="short"\][^{]*\{[^}]*columns/)
  })
})
