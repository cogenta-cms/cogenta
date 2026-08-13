import { CogentaError } from '@cogenta/core'

/**
 * Turning a title into a URL segment.
 *
 * Deliberately dependency-free (rule R9). Unicode already ships the hard part:
 * `normalize('NFD')` splits "é" into "e" plus a combining acute, so dropping the
 * combining range transliterates every accented Latin letter at once. What is
 * left is the handful of letters Unicode does *not* decompose, because they are
 * atomic characters rather than a base plus a mark — "ß", "æ", "ø" and friends.
 */

/**
 * The combining diacritical marks block, U+0300 to U+036F.
 *
 * NFD of Latin text produces marks from this block and no other, so the range
 * is exact for what this function claims to handle. Written as code points
 * rather than as a character class because the characters themselves are
 * invisible in an editor, and an invisible character in a regex is a bug
 * waiting to be introduced by the next person who touches the line.
 */
const COMBINING_FIRST = 0x0300
const COMBINING_LAST = 0x036f

/**
 * Latin letters with no decomposition. Their transliteration is a convention,
 * not an algorithm, so it has to be written down.
 */
const ATOMIC_LETTERS: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ł: 'l',
  ı: 'i',
  ħ: 'h',
  ŧ: 't',
  ŋ: 'n',
  ĸ: 'k',
  ſ: 's',
}

export const DEFAULT_SLUG_MAX_LENGTH = 96

export interface SlugifyOptions {
  /**
   * Longest slug produced, in characters. A long title is truncated on a word
   * boundary rather than mid-word, so the result still reads.
   */
  readonly maxLength?: number
  /** The character between words. Anything but `-` is unusual; it is here for completeness. */
  readonly separator?: string
}

/**
 * A URL-safe, lowercase segment derived from arbitrary text.
 *
 * Returns an empty string when the input carries nothing transliterable — a
 * title written entirely in Chinese, Arabic or Cyrillic. That is a real case,
 * not an error: the caller decides whether to fall back to a manual slug or to
 * refuse. `slugifyOrThrow` is the variant for callers that need a value.
 */
export function slugify(input: string, options: SlugifyOptions = {}): string {
  const separator = options.separator ?? '-'
  const maxLength = options.maxLength ?? DEFAULT_SLUG_MAX_LENGTH

  let text = ''
  for (const character of input.toLowerCase().normalize('NFD')) {
    const code = character.codePointAt(0) ?? 0
    if (code >= COMBINING_FIRST && code <= COMBINING_LAST) continue
    // Looked up after NFD, so a decomposed character is never taken for an atom.
    text += ATOMIC_LETTERS[character] ?? character
  }

  const words = text.split(/[^a-z0-9]+/u).filter((word) => word.length > 0)
  if (words.length === 0) return ''

  return truncate(words, separator, maxLength)
}

/** Keeps whole words, so a truncated slug never ends on half a word. */
function truncate(words: readonly string[], separator: string, maxLength: number): string {
  let slug = ''

  for (const word of words) {
    const next = slug.length === 0 ? word : `${slug}${separator}${word}`
    if (next.length > maxLength) break
    slug = next
  }

  // A single first word longer than the budget still has to yield something.
  return slug.length === 0 ? (words[0] ?? '').slice(0, maxLength) : slug
}

/** `slugify`, for callers that cannot proceed without a value. */
export function slugifyOrThrow(input: string, options: SlugifyOptions = {}): string {
  const slug = slugify(input, options)
  if (slug.length > 0) return slug

  throw new CogentaError({
    code: 'CONTENT_SLUG_INVALID',
    message: `"${input}" contains no character usable in a URL.`,
    hint: 'Enter the slug by hand. A title written in a non-Latin script cannot be transliterated automatically.',
    details: { input },
  })
}

/**
 * Whether a string is already a well-formed slug.
 *
 * Used to accept an editor-provided slug as it stands rather than mangling it:
 * a human who typed "faq-2026" meant it.
 */
export function isSlug(value: string, options: SlugifyOptions = {}): boolean {
  if (value.length === 0) return false
  if (value.length > (options.maxLength ?? DEFAULT_SLUG_MAX_LENGTH)) return false

  return value === slugify(value, options)
}
