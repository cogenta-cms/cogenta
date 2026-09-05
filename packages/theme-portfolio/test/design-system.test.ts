import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is the layer every block
 * inherits from, and it is written entirely as functions of contract D's
 * closed token set. Two things can go wrong there and neither shows up in a
 * snapshot:
 *
 * 1. **A misspelt skin variable.** `renderSkin` kebab-cases token names, so a
 *    camelCase reference resolves to nothing and the colour is silently
 *    missing.
 * 2. **A derived colour that fails contrast.** Every value here is a
 *    `color-mix` or a relative `oklch()`, so no one can read the file and
 *    know the ratio.
 *
 * So this file resolves the real stylesheet against the real default skin and
 * computes the answers, in both schemes.
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

/** The same transformation `renderSkin`'s `cssVariableName` applies. */
function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** Every `--cogenta-*` property `renderSkin` actually emits, for this skin. */
const TYPE_SCALE_STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const

const EMITTED_SKIN_PROPERTIES: ReadonlySet<string> = new Set([
  ...Object.entries(skin).flatMap(([group, tokens]) =>
    Object.keys(tokens).map((name) => `--cogenta-${group}-${kebab(name)}`),
  ),
  '--cogenta-space-scale',
  ...TYPE_SCALE_STEPS.map((step) => `--cogenta-font-size-${step}`),
])

/** `--cg-x: value;` in file order; a later declaration wins, as in CSS. */
function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/(--cg-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1] as string, (match[2] as string).replace(/\s+/g, ' ').trim())
  }
  return found
}

const CG = declarations(SOURCES.get('tokens.css') as string)

/** The skin's own colours, under the names the generated sheet gives them. */
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
 * Contract D validates three pairs on the skin itself. These are the pairs
 * the *theme* invents on top of it — a muted ink on a sunken panel, a tinted
 * badge, an inverted CTA panel, a lifted dark accent — none of which the skin
 * validator ever sees.
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
  ['--cg-surface-inverted-fg', '--cg-surface-inverted'],
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
      // 3:1 is the non-text threshold (WCAG 1.4.11); a border below it is
      // decoration, not a boundary anyone can see.
      const ratio = contrast(color('--cg-line-strong', scheme), color('--cg-surface', scheme))
      expect(ratio).toBeGreaterThanOrEqual(3)
    })
  })
}

/**
 * This theme's own five decisions for the dark palette — see `tokens.css`'s
 * own comment for the reasoning. Each assertion is something a mechanical
 * swap of `bg` and `fg` would fail.
 */
describe('the dark palette is designed, not inverted', () => {
  const lightness = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).l

  it('pushes the accent toward neon rather than merely lifting it', () => {
    expect(lightness('--cg-accent', 'dark')).toBeGreaterThan(
      lightness('--cg-accent', 'light') + 0.1,
    )
  })

  it('flips the accent foreground to ink, because the accent it sits on is now light', () => {
    expect(lightness('--cg-accent-fg', 'dark')).toBeLessThan(0.3)
    expect(lightness('--cg-accent-fg', 'light')).toBeGreaterThan(0.7)
  })

  it('expresses elevation as lightness, sunken through raised', () => {
    const ladder = [
      '--cg-surface-sunken',
      '--cg-canvas',
      '--cg-surface',
      '--cg-surface-raised',
    ].map((property) => lightness(property, 'dark'))
    for (let index = 1; index < ladder.length; index += 1) {
      expect(ladder[index] as number).toBeGreaterThan(ladder[index - 1] as number)
    }
  })

  it('inverts nothing in light mode, where elevation is a hard offset shadow instead', () => {
    // Canvas, surface and raised are the same paper in light: the difference
    // is carried by the skin's own `shadow.sm`/`shadow.md`, not by colour.
    expect(lightness('--cg-canvas', 'light')).toBeCloseTo(lightness('--cg-surface-raised', 'light'))
    expect(CG.get('--cg-elevation-2')).toContain('--cg')
  })

  it('draws borders as a step up in lightness in dark mode, never down', () => {
    expect(lightness('--cg-line', 'dark')).toBeGreaterThan(lightness('--cg-surface', 'dark'))
    expect(lightness('--cg-line', 'light')).toBeLessThan(lightness('--cg-surface', 'light'))
  })

  it('keeps elevation a hard, zero-blur offset shadow in dark mode too (L25 D5: never a glow)', () => {
    const dark = CG.get('--cg-elevation-2') as string
    expect(dark).not.toContain('--cg-accent-glow')
    expect(dark).not.toMatch(/\bblur\(/)
    // Same offset geometry as light, recoloured in the brighter-than-surface
    // line token dark mode already uses for depth — never a soft radius.
    expect(dark).toContain('0.25rem 0.25rem 0 var(--cg-line-strong)')
  })

  it('keeps text off pure white, and the canvas off pure black', () => {
    expect(lightness('--cg-ink', 'dark')).toBeLessThan(0.98)
    expect(lightness('--cg-ink', 'dark')).toBeGreaterThan(0.85)
    expect(lightness('--cg-canvas', 'dark')).toBeGreaterThan(0.08)
    expect(lightness('--cg-canvas', 'dark')).toBeLessThan(0.3)
  })

  it('inverts the CTA panel the same way in both schemes, ink and paper trading places', () => {
    // `--cg-surface-inverted` is the dark literal in light mode and the light
    // literal in dark mode, by construction — a CTA panel is meant to invert
    // relative to whatever the page currently is.
    expect(lightness('--cg-surface-inverted', 'light')).toBeLessThan(
      lightness('--cg-canvas', 'light'),
    )
    expect(lightness('--cg-surface-inverted', 'dark')).toBeGreaterThan(
      lightness('--cg-canvas', 'dark'),
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
    for (const property of ['--cg-canvas', '--cg-ink', '--cg-accent']) {
      const before = tokens.slice(0, tokens.indexOf('@supports (color:'))
      expect(before, `${property} needs a pre-@supports fallback`).toContain(`${property}:`)
    }
  })
})
