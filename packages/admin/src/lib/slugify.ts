/** Unicode combining diacritical marks — exported so `foldForSearch`-style helpers can strip the same accents this file's own normalisation does. */
export const COMBINING_MARKS = /[̀-ͯ]/gu

/**
 * A minimal identifier from a freshly typed label: lowercase, non-alphanumerics
 * become one dash, no leading/trailing dash.
 *
 * Deliberately not as thorough as a dedicated slug field with server-side
 * uniqueness — every caller only ever uses this to *pre-fill* an identifier
 * while its owner is still typing a human label; the server remains the one
 * thing that actually enforces uniqueness once the form is submitted.
 */
export function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}
