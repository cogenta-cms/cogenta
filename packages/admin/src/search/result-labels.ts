import type { TFunction } from 'i18next'
import { humanizeFieldName } from '../lib/humanize-field-name.js'
import type { CollectionSummary } from '../schema/types.js'

/**
 * How search results name the things they found. Both the command palette and
 * the full results page show these as secondary text, and a raw identifier
 * (`post`, `image`, `fr`, `header-action`) there reads as a leak of the
 * database rather than a description of the result.
 */

/** A collection by its singular label (`Actualité`), never its internal name (`post`). */
export function collectionLabel(
  collections: readonly CollectionSummary[] | null,
  name: string,
): string {
  return collections?.find((collection) => collection.name === name)?.labels.singular ?? name
}

/** `image` → "Image", in the admin's language; an unknown kind keeps its own name, capitalised. */
export function mediaKindLabel(t: TFunction, kind: string): string {
  return t(`searchResults.mediaKind.${kind}`, { defaultValue: humanizeFieldName(kind) })
}

/** `theme` → "Thème", `plugin` → "Extension". */
export function marketplaceKindLabel(t: TFunction, kind: string): string {
  return t(`searchResults.extensionKind.${kind}`, { defaultValue: humanizeFieldName(kind) })
}

/** `fr` → "français" (in the admin's own language); an unknown code is returned as written. */
export function languageName(code: string, uiLanguage: string): string {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * A menu's display name. Menus are created with a machine-style name
 * (`header-action`); the screen shows it as words, not as a slug.
 */
export function menuDisplayName(label: string): string {
  return /\s/u.test(label) ? label : humanizeFieldName(label)
}
