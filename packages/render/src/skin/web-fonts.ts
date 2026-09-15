import type { FontTokens } from './tokens.js'

/**
 * The web fonts a skin may name and have actually load (L29 D1).
 *
 * A skin names typefaces in `font.sans`/`font.serif`/`font.mono`, and until
 * this existed nothing ever fetched them: a personalisation that chose
 * `'Playfair Display', Georgia, serif` rendered in Georgia, which is most of
 * why a personalised theme looked cheaper than the theme it started from.
 *
 * The catalogue is closed on purpose. Every entry is a Google Fonts family
 * whose `css2` request — this exact axis string — was fetched and answered
 * with real `@font-face` rules on 2026-09-15; a wrong axis range makes Google
 * answer 400 and the family silently never loads, so entries are not added by
 * guesswork. A family outside the catalogue is still a valid skin (a system
 * stack, a self-hosted face): it is simply not fetched from here.
 */

export type WebFontRole = 'serif' | 'sans' | 'mono'

export interface WebFont {
  readonly family: string
  /** The token a family is meant for. A skin may still use it elsewhere. */
  readonly role: WebFontRole
  /** The `css2` axis request, verified against the Google Fonts API. */
  readonly axes: string
}

export const WEB_FONTS: readonly WebFont[] = [
  { family: 'Besley', role: 'serif', axes: 'ital,wght@0,400..900;1,400..900' },
  {
    family: 'Bodoni Moda',
    role: 'serif',
    axes: 'ital,opsz,wght@0,6..96,400..900;1,6..96,400..900',
  },
  { family: 'Cormorant', role: 'serif', axes: 'ital,wght@0,300..700;1,300..700' },
  { family: 'Cormorant Garamond', role: 'serif', axes: 'ital,wght@0,300..700;1,300..700' },
  { family: 'Cormorant Infant', role: 'serif', axes: 'ital,wght@0,300..700;1,300..700' },
  { family: 'Crimson Pro', role: 'serif', axes: 'ital,wght@0,200..900;1,200..900' },
  { family: 'DM Serif Display', role: 'serif', axes: 'ital@0;1' },
  { family: 'DM Serif Text', role: 'serif', axes: 'ital@0;1' },
  { family: 'EB Garamond', role: 'serif', axes: 'ital,wght@0,400..800;1,400..800' },
  { family: 'Fraunces', role: 'serif', axes: 'ital,opsz,wght@0,9..144,300..800;1,9..144,300..800' },
  { family: 'Gloock', role: 'serif', axes: 'wght@400' },
  { family: 'Instrument Serif', role: 'serif', axes: 'ital@0;1' },
  { family: 'Libre Baskerville', role: 'serif', axes: 'ital,wght@0,400;0,700;1,400' },
  { family: 'Libre Caslon Text', role: 'serif', axes: 'ital,wght@0,400;0,700;1,400' },
  { family: 'Literata', role: 'serif', axes: 'ital,opsz,wght@0,7..72,200..900;1,7..72,200..900' },
  { family: 'Lora', role: 'serif', axes: 'ital,wght@0,400..700;1,400..700' },
  {
    family: 'Merriweather',
    role: 'serif',
    axes: 'ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700',
  },
  { family: 'Newsreader', role: 'serif', axes: 'ital,opsz,wght@0,6..72,200..800;1,6..72,200..800' },
  { family: 'Noto Serif', role: 'serif', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'PT Serif', role: 'serif', axes: 'ital,wght@0,400;0,700;1,400;1,700' },
  { family: 'Petrona', role: 'serif', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Playfair Display', role: 'serif', axes: 'ital,wght@0,400..900;1,400..900' },
  {
    family: 'Source Serif 4',
    role: 'serif',
    axes: 'ital,opsz,wght@0,8..60,200..900;1,8..60,200..900',
  },
  { family: 'Spectral', role: 'serif', axes: 'ital,wght@0,300;0,400;0,600;0,700;1,400' },
  { family: 'Young Serif', role: 'serif', axes: 'wght@400' },
  { family: 'Albert Sans', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Archivo', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Barlow', role: 'sans', axes: 'ital,wght@0,400;0,500;0,600;0,700;1,400' },
  { family: 'Bricolage Grotesque', role: 'sans', axes: 'opsz,wght@12..96,200..800' },
  { family: 'DM Sans', role: 'sans', axes: 'ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000' },
  { family: 'Epilogue', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Figtree', role: 'sans', axes: 'ital,wght@0,300..900;1,300..900' },
  { family: 'Geist', role: 'sans', axes: 'wght@100..900' },
  { family: 'Hanken Grotesk', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'IBM Plex Sans', role: 'sans', axes: 'ital,wght@0,100..700;1,100..700' },
  { family: 'Instrument Sans', role: 'sans', axes: 'ital,wght@0,400..700;1,400..700' },
  { family: 'Inter', role: 'sans', axes: 'ital,opsz,wght@0,14..32,100..900;1,14..32,100..900' },
  { family: 'Inter Tight', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Karla', role: 'sans', axes: 'ital,wght@0,200..800;1,200..800' },
  { family: 'Lato', role: 'sans', axes: 'ital,wght@0,400;0,700;1,400' },
  { family: 'Libre Franklin', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Manrope', role: 'sans', axes: 'wght@200..800' },
  { family: 'Montserrat', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Mulish', role: 'sans', axes: 'ital,wght@0,200..1000;1,200..1000' },
  {
    family: 'Nunito Sans',
    role: 'sans',
    axes: 'ital,opsz,wght@0,6..12,200..1000;1,6..12,200..1000',
  },
  { family: 'Onest', role: 'sans', axes: 'wght@100..900' },
  { family: 'Open Sans', role: 'sans', axes: 'ital,wght@0,300..800;1,300..800' },
  { family: 'Outfit', role: 'sans', axes: 'wght@100..900' },
  { family: 'Plus Jakarta Sans', role: 'sans', axes: 'ital,wght@0,200..800;1,200..800' },
  { family: 'Public Sans', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Roboto', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'Rubik', role: 'sans', axes: 'ital,wght@0,300..900;1,300..900' },
  { family: 'Schibsted Grotesk', role: 'sans', axes: 'ital,wght@0,400..900;1,400..900' },
  { family: 'Sora', role: 'sans', axes: 'wght@100..800' },
  { family: 'Source Sans 3', role: 'sans', axes: 'ital,wght@0,200..900;1,200..900' },
  { family: 'Space Grotesk', role: 'sans', axes: 'wght@300..700' },
  { family: 'Syne', role: 'sans', axes: 'wght@400..800' },
  { family: 'Work Sans', role: 'sans', axes: 'ital,wght@0,100..900;1,100..900' },
  { family: 'DM Mono', role: 'mono', axes: 'ital,wght@0,300;0,400;0,500;1,400' },
  { family: 'Fira Code', role: 'mono', axes: 'wght@300..700' },
  { family: 'Geist Mono', role: 'mono', axes: 'wght@100..900' },
  { family: 'IBM Plex Mono', role: 'mono', axes: 'ital,wght@0,400;0,500;0,600;1,400' },
  { family: 'JetBrains Mono', role: 'mono', axes: 'ital,wght@0,100..800;1,100..800' },
  { family: 'Source Code Pro', role: 'mono', axes: 'ital,wght@0,200..900;1,200..900' },
  { family: 'Space Mono', role: 'mono', axes: 'ital,wght@0,400;0,700;1,400' },
]

const BY_FAMILY = new Map(WEB_FONTS.map((font) => [font.family.toLowerCase(), font]))

/** The family a stack actually asks for first, unquoted: `'Playfair Display', Georgia` → `Playfair Display`. */
export function primaryFamily(stack: string): string {
  const first = stack.split(',')[0] ?? ''
  return first
    .trim()
    .replace(/^(["'])(.*)\1$/u, '$2')
    .trim()
}

export function findWebFont(family: string): WebFont | undefined {
  return BY_FAMILY.get(family.trim().toLowerCase())
}

export function webFontUrl(font: WebFont): string {
  return `https://fonts.googleapis.com/css2?family=${font.family.replaceAll(' ', '+')}:${font.axes}&display=swap`
}

/**
 * The catalogue fonts a skin's three stacks lead with, once each, in token
 * order. One `@import` per family rather than one combined request, so a
 * single family Google ever stops serving cannot take the others down with it.
 */
export function webFontImports(font: FontTokens): readonly string[] {
  const seen = new Set<string>()
  const imports: string[] = []
  for (const stack of [font.sans, font.serif, font.mono]) {
    const found = findWebFont(primaryFamily(stack))
    if (found === undefined || seen.has(found.family)) continue
    seen.add(found.family)
    imports.push(`@import url("${webFontUrl(found)}");`)
  }
  return imports
}
