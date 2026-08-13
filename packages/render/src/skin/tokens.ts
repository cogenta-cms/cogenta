/**
 * The skin token set of contract D (`theme@1.0`).
 *
 * The set is *closed*: a skin that omits a token is refused, and a skin that
 * adds one is refused too. Both halves matter. Omission would leave a variable
 * undefined at render time; addition would let a skin smuggle in presentation
 * the theme never declared, which is the door rule R3 closes on blocks and this
 * closes on skins.
 */

export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const
export type Density = (typeof DENSITIES)[number]

export type ColorTokens = {
  readonly bg: string
  readonly fg: string
  readonly accent: string
  readonly accentFg: string
  readonly muted: string
  readonly mutedFg: string
  readonly border: string
}

export type FontTokens = {
  readonly sans: string
  readonly serif: string
  readonly mono: string
  /** Ratio between two consecutive steps of the typographic scale. */
  readonly scale: number
  readonly baseSize: string
}

export type SpaceTokens = {
  readonly unit: string
  readonly density: Density
}

export type RadiusTokens = {
  readonly sm: string
  readonly md: string
  readonly lg: string
}

export type MotionTokens = {
  readonly duration: string
  readonly easing: string
  /** Declares that the skin honours `prefers-reduced-motion`. Must be true. */
  readonly reduced: boolean
}

export type ShadowTokens = {
  readonly sm: string
  readonly md: string
}

export interface SkinTokens {
  readonly color: ColorTokens
  readonly font: FontTokens
  readonly space: SpaceTokens
  readonly radius: RadiusTokens
  readonly motion: MotionTokens
  readonly shadow: ShadowTokens
}

/** Kinds drive both the structural check and the CSS emitted for a token. */
export type TokenKind = 'color' | 'length' | 'duration' | 'ratio' | 'text' | 'boolean' | 'density'

export interface TokenSpec {
  readonly group: keyof SkinTokens
  readonly name: string
  readonly kind: TokenKind
}

/**
 * The single source of truth. Validation, CSS rendering and the error messages
 * all read this list, so a token can never exist in one and not the others.
 */
export const TOKEN_SPECS: readonly TokenSpec[] = [
  { group: 'color', name: 'bg', kind: 'color' },
  { group: 'color', name: 'fg', kind: 'color' },
  { group: 'color', name: 'accent', kind: 'color' },
  { group: 'color', name: 'accentFg', kind: 'color' },
  { group: 'color', name: 'muted', kind: 'color' },
  { group: 'color', name: 'mutedFg', kind: 'color' },
  { group: 'color', name: 'border', kind: 'color' },

  { group: 'font', name: 'sans', kind: 'text' },
  { group: 'font', name: 'serif', kind: 'text' },
  { group: 'font', name: 'mono', kind: 'text' },
  { group: 'font', name: 'scale', kind: 'ratio' },
  { group: 'font', name: 'baseSize', kind: 'length' },

  { group: 'space', name: 'unit', kind: 'length' },
  { group: 'space', name: 'density', kind: 'density' },

  { group: 'radius', name: 'sm', kind: 'length' },
  { group: 'radius', name: 'md', kind: 'length' },
  { group: 'radius', name: 'lg', kind: 'length' },

  { group: 'motion', name: 'duration', kind: 'duration' },
  { group: 'motion', name: 'easing', kind: 'text' },
  { group: 'motion', name: 'reduced', kind: 'boolean' },

  { group: 'shadow', name: 'sm', kind: 'text' },
  { group: 'shadow', name: 'md', kind: 'text' },
]

export const TOKEN_GROUPS: readonly (keyof SkinTokens)[] = [
  'color',
  'font',
  'space',
  'radius',
  'motion',
  'shadow',
]

/**
 * The contrast pairs contract D declares, with the text size each one carries.
 *
 * All three are checked at the *normal text* threshold, not the large-text one.
 * `accentFg` on `accent` is the label of a button, `mutedFg` on `muted` is the
 * body of a callout: both routinely carry body-sized text. Declaring them
 * "large" would double the accepted colour space and quietly break real pages.
 * The 3:1 threshold stays available through `meetsContrastAa` for tokens that
 * genuinely only ever carry large text — there are none in `theme@1.0`.
 */
export interface ContrastPair {
  readonly foreground: keyof ColorTokens
  readonly background: keyof ColorTokens
  readonly size: 'normal' | 'large'
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: 'fg', background: 'bg', size: 'normal' },
  { foreground: 'accentFg', background: 'accent', size: 'normal' },
  { foreground: 'mutedFg', background: 'muted', size: 'normal' },
]

/** Steps of the generated typographic scale, from smallest to largest. */
export const TYPE_SCALE_STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const
export type TypeScaleStep = (typeof TYPE_SCALE_STEPS)[number]

/** `md` is the base size; steps below it divide by the ratio, above multiply. */
export const TYPE_SCALE_BASE_INDEX = 2
