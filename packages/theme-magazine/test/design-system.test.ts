import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, evaluate, type Scheme, type Srgb, toOklch } from './css-color.js'

/**
 * The design system (`src/styles/tokens.css`) is the layer every block
 * inherits from, written entirely as functions of contract D's closed token
 * set. This resolves the real stylesheet against the real default skin and
 * computes the answers, in both schemes — the same technique
 * `theme-canonical` uses, reproduced here against this theme's own token
 * names (`--cg-paper`/`--cg-ink`/`--cg-rule`/…) and its own dark-mode
 * design decisions.
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
    found.set(match[1] as string, (match[2] as string).replace(/\s+/g, ' ').trim())
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
 * Pairs this theme's own CSS invents on top of the skin — a soft ink on a
 * boxed note, a tinted accent, a lifted dark accent — none of which contract
 * D's skin validator ever checks.
 */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--cg-ink', '--cg-paper'],
  ['--cg-ink', '--cg-paper-raised'],
  ['--cg-ink', '--cg-paper-panel'],
  ['--cg-ink-soft', '--cg-paper'],
  ['--cg-ink-soft', '--cg-paper-panel'],
  ['--cg-ink-soft', '--cg-paper-raised'],
  ['--cg-ink-faint', '--cg-paper'],
  ['--cg-ink-faint', '--cg-paper-panel'],
  ['--cg-accent-ink', '--cg-accent'],
  ['--cg-accent-ink', '--cg-accent-hover'],
  ['--cg-accent-tint-ink', '--cg-accent-tint'],
  ['--cg-accent', '--cg-paper'],
  ['--cg-accent', '--cg-paper-panel'],
]

for (const scheme of ['light', 'dark'] as const) {
  describe(`the ${scheme} palette`, () => {
    for (const [foreground, background] of TEXT_PAIRS) {
      it(`reaches AA body contrast for ${foreground} on ${background}`, () => {
        const ratio = contrast(color(foreground, scheme), color(background, scheme))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('separates a heavy rule from the surface it sits on', () => {
      // 3:1 is the non-text threshold (WCAG 1.4.11); a rule below it is
      // decoration, not a boundary anyone can see.
      const ratio = contrast(color('--cg-rule-heavy', scheme), color('--cg-paper-raised', scheme))
      expect(ratio).toBeGreaterThanOrEqual(3)
    })
  })
}

describe('the dark palette is designed for reading at night, not inverted', () => {
  const lightness = (property: string, scheme: Scheme): number => toOklch(color(property, scheme)).l

  it('lifts the accent instead of carrying the daylight value across', () => {
    expect(lightness('--cg-accent', 'dark')).toBeGreaterThan(
      lightness('--cg-accent', 'light') + 0.1,
    )
  })

  it('flips the accent foreground to ink, because the accent it sits on is now light', () => {
    expect(lightness('--cg-accent-ink', 'dark')).toBeLessThan(0.3)
    expect(lightness('--cg-accent-ink', 'light')).toBeGreaterThan(0.7)
  })

  it('expresses elevation as lightness, panel through raised', () => {
    const ladder = ['--cg-paper-panel', '--cg-paper', '--cg-paper-raised'].map((property) =>
      lightness(property, 'dark'),
    )
    for (let index = 1; index < ladder.length; index += 1) {
      expect(ladder[index] as number).toBeGreaterThan(ladder[index - 1] as number)
    }
  })

  it('inverts nothing in light mode, where elevation is a shadow instead', () => {
    expect(lightness('--cg-paper', 'light')).toBeCloseTo(lightness('--cg-paper-raised', 'light'))
    expect(CG.get('--cg-elevation-2')).toContain('--cg')
  })

  it('draws rules as a step up in lightness, never down', () => {
    expect(lightness('--cg-rule', 'dark')).toBeGreaterThan(lightness('--cg-paper', 'dark'))
    expect(lightness('--cg-rule', 'light')).toBeLessThan(lightness('--cg-paper', 'light'))
  })

  it('keeps text off pure white, and the canvas off pure black', () => {
    expect(lightness('--cg-ink', 'dark')).toBeLessThan(0.98)
    expect(lightness('--cg-ink', 'dark')).toBeGreaterThan(0.85)
    expect(lightness('--cg-paper', 'dark')).toBeGreaterThan(0.1)
    expect(lightness('--cg-paper', 'dark')).toBeLessThan(0.3)
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
    for (const property of ['--cg-paper', '--cg-ink', '--cg-accent']) {
      const before = tokens.slice(0, tokens.indexOf('@supports (color:'))
      expect(before, `${property} needs a pre-@supports fallback`).toContain(`${property}:`)
    }
  })
})
