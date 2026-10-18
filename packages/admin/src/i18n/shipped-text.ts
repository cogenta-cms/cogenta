import type { TFunction } from 'i18next'
import en from './locales/en.json'

/**
 * Words Cogenta ships as data — a built-in prompt's name and description, an
 * admin skin's description — reach the admin in English, from the server. They
 * are still Cogenta's own words, so the admin shows them in the reader's
 * language, but only while they are untouched: a site owner who rewrote a
 * description reads their own text, never a translation of the original.
 *
 * `key` is a path under `shippedText` in the locale files; the English file
 * holds the exact text the server ships, which is what "untouched" is checked
 * against.
 */
export function shippedText(key: string, served: string, t: TFunction): string {
  const shipped = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      (en as { shippedText: unknown }).shippedText,
    )
  return shipped === served ? t(`shippedText.${key}`) : served
}
