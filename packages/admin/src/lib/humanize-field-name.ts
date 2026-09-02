/**
 * Fiche 01 audit T02 — the fallback label when a field declares no
 * `admin.label`: `internalCode` used to render as literally `internalCode`
 * rather than something a human reads as a label. The field's own `name`
 * is a technical identifier, not a translation key (an arbitrary string a
 * schema author chose), so this is deliberately a pure transform, never an
 * i18n lookup.
 *
 * `camelCase` and `snake_case` both split into words, each capitalised.
 * `seoTitle` → "Seo Title": no acronym dictionary — a hand-picked list would
 * be over-engineering for a case no real field has hit yet (AGENTS.md's own
 * "don't build for a hypothetical").
 */
export function humanizeFieldName(name: string): string {
  const withSpaces = name
    // camelCase / PascalCase boundary: insert a space before an
    // upper-case letter that follows a lower-case one or a digit.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // A run of upper-case letters followed by a lower-case one (an
    // acronym rolling into a word, e.g. "HTTPServer") — split before the
    // last upper-case letter of the run.
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()

  if (withSpaces === '') return name

  return withSpaces
    .split(/\s+/)
    .map((word) =>
      word.length === 0 ? word : word[0]?.toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(' ')
}
