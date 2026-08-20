/**
 * Skin system: a closed set of design tokens, validated in hard-refusal mode,
 * rendered to one stylesheet of CSS custom properties and swappable without a
 * build (contract D, `theme@1.0`).
 */

export type { Rgb, Rgba, TextSize } from './color.js'
export {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  aaThreshold,
  compositeOver,
  contrastRatio,
  formatRatio,
  meetsContrastAa,
  parseColor,
  relativeLuminance,
} from './color.js'
export type { RenderSkinCssOptions } from './css.js'
export { CSS_VARIABLE_PREFIX, cssVariableName, renderSkinCss } from './css.js'
export type { SkinTokenOverrides } from './merge.js'
export { mergeSkinTokens } from './merge.js'
export type { SkinSheet, SkinStore, SkinStoreOptions } from './sheet.js'
export { createSkinStore, renderSkin } from './sheet.js'
export type {
  ColorTokens,
  ContrastPair,
  Density,
  FontTokens,
  MotionTokens,
  RadiusTokens,
  ShadowTokens,
  SkinTokens,
  SpaceTokens,
  TokenKind,
  TokenSpec,
  TypeScaleStep,
} from './tokens.js'
export {
  CONTRAST_PAIRS,
  DENSITIES,
  TOKEN_GROUPS,
  TOKEN_SPECS,
  TYPE_SCALE_STEPS,
} from './tokens.js'
export { computeTypeScale, validateSkin } from './validate.js'
