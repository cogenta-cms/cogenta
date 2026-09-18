import { interpolate, themeLocaleFor } from '@cogenta/theme-kit'

/**
 * The one word a list of open positions needs that the shared vocabulary
 * does not.
 *
 * `@cogenta/theme-kit`'s `THEME_STRINGS` carries the strings every theme's
 * blocks share; this belongs to one register (a careers listing), so it
 * lives with the theme that draws it, in the two languages the shared table
 * knows. A locale the table does not know reads English, the same rule
 * `createThemeTranslator` follows.
 */

type CollectionStringKey = 'apply'

const STRINGS: Readonly<Record<'en' | 'fr', Readonly<Record<CollectionStringKey, string>>>> = {
  en: {
    apply: 'Apply',
  },
  fr: {
    apply: 'Postuler',
  },
}

export function collectionString(
  locale: string,
  key: CollectionStringKey,
  values?: Readonly<Record<string, string | number>>,
): string {
  return interpolate(STRINGS[themeLocaleFor(locale)][key], values)
}

export type { CollectionStringKey }
