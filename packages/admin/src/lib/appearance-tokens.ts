import { availableWebFonts, parseColor, primaryFamily, type WebFont } from '@cogenta/render/browser'

/**
 * Pure helpers behind the site "Apparence" editor: turning the raw CSS strings
 * of contract D's tokens into the small controls a person can actually use
 * (a font list, a number and a unit, a duration in milliseconds, a handful of
 * easing curves and shadows), and back. Everything the editor writes is one of
 * the strings a token already accepts, so the closed token set of contract D
 * is untouched — only the way it is entered changes.
 */

export type FontRole = 'sans' | 'serif' | 'mono'

const STACK_TAIL: Record<FontRole, string> = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
}

/** The value of the "system font" option of a font list. */
export const SYSTEM_FONT = '__system'
/** The value of the option standing for a stack the list does not know. */
export const CUSTOM_VALUE = '__custom'

/** The families the site serves itself, so choosing one always renders. */
export function bundledFonts(): readonly WebFont[] {
  return availableWebFonts(false)
}

/** The stack to store for a family, with the system fallbacks of its kind. */
export function fontStack(family: string, role: FontRole): string {
  return `'${family}', ${STACK_TAIL[role]}`
}

/** The stack of the platform's own font for a token. */
export function systemFontStack(role: FontRole): string {
  return STACK_TAIL[role]
}

/**
 * What a font list should show for a stored stack: a bundled family, the
 * system stack, or "custom" for anything else (a stack written by hand or by
 * the AI workshop, kept as it is until the person picks something).
 */
export function fontChoice(stack: unknown, role: FontRole): string {
  if (typeof stack !== 'string' || stack.trim() === '') return SYSTEM_FONT
  if (stack.trim() === STACK_TAIL[role]) return SYSTEM_FONT
  const family = primaryFamily(stack)
  const known = bundledFonts().find((font) => font.family.toLowerCase() === family.toLowerCase())
  return known === undefined ? CUSTOM_VALUE : known.family
}

/** The role a bundled family is designed for, used to pick its fallback stack. */
export function roleOfFamily(family: string, fallback: FontRole): FontRole {
  return bundledFonts().find((font) => font.family === family)?.role ?? fallback
}

export type LengthUnit = 'px' | 'rem' | 'em'
export const LENGTH_UNITS: readonly LengthUnit[] = ['px', 'rem', 'em']

export interface ParsedLength {
  readonly amount: number
  readonly unit: LengthUnit
}

/** `0.125rem` → `{0.125, rem}`; anything the control cannot express → `null`. */
export function parseLength(value: unknown): ParsedLength | null {
  if (typeof value !== 'string') return null
  const match = /^(-?\d+(?:\.\d+)?|-?\.\d+)(px|rem|em)$/u.exec(value.trim())
  if (match === null) return null
  return { amount: Number(match[1]), unit: match[2] as LengthUnit }
}

export function formatLength(amount: number, unit: LengthUnit): string {
  const rounded = Math.round(amount * 10000) / 10000
  return `${rounded}${unit}`
}

/** Milliseconds out of `140ms` or `0.2s`; `null` when the value is neither. */
export function parseDurationMs(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/u.exec(value.trim())
  if (match === null) return null
  const amount = Number(match[1])
  return Math.round(match[2] === 's' ? amount * 1000 : amount)
}

export function formatDuration(milliseconds: number): string {
  return `${Math.max(0, Math.round(milliseconds))}ms`
}

export interface Preset {
  readonly id: string
  readonly value: string
}

/** Easing curves, by the name a designer would give them. */
export const EASING_PRESETS: readonly Preset[] = [
  { id: 'standard', value: 'cubic-bezier(0.2, 0, 0, 1)' },
  { id: 'soft', value: 'ease' },
  { id: 'in', value: 'ease-in' },
  { id: 'out', value: 'ease-out' },
  { id: 'inOut', value: 'ease-in-out' },
  { id: 'linear', value: 'linear' },
]

const SHADOW_INK = 'rgba(12, 15, 20,'

/** Shadows by strength, for the small and the medium elevation of contract D. */
export const SHADOW_PRESETS: Readonly<Record<'sm' | 'md', readonly Preset[]>> = {
  sm: [
    { id: 'none', value: 'none' },
    { id: 'line', value: `0 1px 0 ${SHADOW_INK} 0.06)` },
    { id: 'light', value: `0 1px 2px ${SHADOW_INK} 0.12)` },
    { id: 'strong', value: `0 2px 6px ${SHADOW_INK} 0.18)` },
  ],
  md: [
    { id: 'none', value: 'none' },
    { id: 'light', value: `0 4px 12px ${SHADOW_INK} 0.1)` },
    { id: 'medium', value: `0 8px 24px ${SHADOW_INK} 0.12)` },
    { id: 'strong', value: `0 16px 40px ${SHADOW_INK} 0.22)` },
  ],
}

/** The preset a stored value corresponds to, or `CUSTOM_VALUE`. */
export function presetChoice(value: unknown, presets: readonly Preset[]): string {
  if (typeof value !== 'string') return CUSTOM_VALUE
  const squash = (text: string): string => text.replace(/\s+/gu, '')
  const found = presets.find((preset) => squash(preset.value) === squash(value))
  return found === undefined ? CUSTOM_VALUE : found.id
}

/** `#rrggbb` for a native colour input, or `null` when the value has no plain RGB form. */
export function toHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = parseColor(value)
  if (parsed === null) return null
  const hex = (channel: number): string =>
    Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')
  return `#${hex(parsed.r)}${hex(parsed.g)}${hex(parsed.b)}`
}
