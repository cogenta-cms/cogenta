import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is the layer every block
 * inherits from, written entirely as functions of contract D's closed token
 * set. Two things can go wrong there and neither shows up in a snapshot:
 *
 * 1. **A misspelt skin variable.** `renderSkin` kebab-cases token names, so
 *    a theme referencing the camelCase form renders with that colour simply
 *    missing, silently.
 * 2. **A derived colour that fails contrast.** Every value here is a
 *    `color-mix` or a relative `oklch()`, so no one can read the file and
 *    know the ratio.
 *
 * So this file resolves the real stylesheet against the real default skin
 * and computes the answers, in both schemes.
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

const TYPE_SCALE_STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const

const EMITTED_SKIN_PROPERTIES: ReadonlySet<string> = new Set([
  ...Object.entries(skin).flatMap(([group, tokens]) =>
    Object.keys(tokens).map((name) => `--cogenta-${group}-${kebab(name)}`),
  ),
  '--cogenta-space-scale',
  ...TYPE_SCALE_STEPS.map((step) => `--cogenta-font-size-${step}`),
])

/** `--ce-x: value;` in file order; a later declaration wins, as in CSS. */
function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/(--ce-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1] as string, (match[2] as string).replace(/\s+/g, ' ').trim())
  }
  return found
}

const CE = declarations(SOURCES.get('tokens.css') as string)

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

  it('declares every derived property it uses without a fallback', () => {
    const referenced = [...ALL_CSS.matchAll(/var\(\s*(--ce-[a-z0-9-]+)\s*(,?)/g)]
      .filter((match) => match[2] === '')
      .map((match) => match[1] as string)
    const missing = [...new Set(referenced)].filter((name) => !CE.has(name))
    expect(missing).toEqual([])
  })
})

const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--ce-ink', '--ce-canvas'],
  ['--ce-ink', '--ce-surface'],
  ['--ce-ink', '--ce-surface-raised'],
  ['--ce-ink', '--ce-surface-sunken'],
  ['--ce-ink-muted', '--ce-canvas'],
  ['--ce-ink-muted', '--ce-surface-sunken'],
  ['--ce-ink-muted', '--ce-surface-raised'],
  ['--ce-ink-subtle', '--ce-canvas'],
  ['--ce-ink-subtle', '--ce-surface-sunken'],
  ['--ce-accent-fg', '--ce-accent'],
  ['--ce-accent-fg', '--ce-accent-hover'],
  ['--ce-accent-soft-fg', '--ce-accent-soft'],
  ['--ce-accent', '--ce-canvas'],
  ['--ce-accent', '--ce-surface-sunken'],
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
      const ratio = contrast(color('--ce-line-strong', scheme), color('--ce-surface', scheme))
      expect(ratio).toBeGreaterThanOrEqual(3)
    })
  })
}

describe('the dark palette is a genuine second design, not an inversion', () => {
  const lightness = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).l

  it('lifts the accent in dark mode rather than carrying the light value across', () => {
    expect(lightness('--ce-accent', 'dark')).toBeGreaterThan(
      lightness('--ce-accent', 'light') + 0.1,
    )
  })

  it('flips the accent foreground to ink, because the accent it sits on is now light', () => {
    expect(lightness('--ce-accent-fg', 'dark')).toBeLessThan(0.3)
    expect(lightness('--ce-accent-fg', 'light')).toBeGreaterThan(0.7)
  })

  it('expresses elevation as lightness, sunken through raised', () => {
    const ladder = [
      '--ce-surface-sunken',
      '--ce-canvas',
      '--ce-surface',
      '--ce-surface-raised',
    ].map((property) => lightness(property, 'dark'))
    for (let index = 1; index < ladder.length; index += 1) {
      expect(ladder[index] as number).toBeGreaterThan(ladder[index - 1] as number)
    }
  })

  it('inverts nothing in light mode, where elevation is a shadow instead', () => {
    expect(lightness('--ce-canvas', 'light')).toBeCloseTo(lightness('--ce-surface-raised', 'light'))
    expect(CE.get('--ce-elevation-2')).toContain('--ce')
  })

  it('draws borders as a step up in lightness in dark mode, and a step down in light mode', () => {
    expect(lightness('--ce-line', 'dark')).toBeGreaterThan(lightness('--ce-surface', 'dark'))
    expect(lightness('--ce-line', 'light')).toBeLessThan(lightness('--ce-surface', 'light'))
  })

  it('keeps text off pure white in dark mode, and the canvas off pure black', () => {
    expect(lightness('--ce-ink', 'dark')).toBeLessThan(0.98)
    expect(lightness('--ce-ink', 'dark')).toBeGreaterThan(0.85)
    expect(lightness('--ce-canvas', 'dark')).toBeGreaterThan(0.1)
    expect(lightness('--ce-canvas', 'dark')).toBeLessThan(0.3)
  })

  it('keeps the accent loud in dark mode: chroma is not sharply reduced from the light value', () => {
    const chromaOf = (scheme: Scheme): number => toOklch(color('--ce-accent', scheme)).c
    // A generic "pastel-ify for dark mode" pass would roughly halve chroma;
    // this theme's own design choice is to keep the accent's punch.
    expect(chromaOf('dark')).toBeGreaterThan(chromaOf('light') * 0.7)
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
    for (const property of ['--ce-canvas', '--ce-ink', '--ce-accent']) {
      const before = tokens.slice(0, tokens.indexOf('@supports (color:'))
      expect(before, `${property} needs a pre-@supports fallback`).toContain(`${property}:`)
    }
  })
})
