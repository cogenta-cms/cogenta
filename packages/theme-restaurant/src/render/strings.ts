import { interpolate, themeLocaleFor } from '@cogenta/theme-kit'

/**
 * The few words a restaurant's own pages need that the shared vocabulary
 * does not: the labels of a dish's details, and the word a menu prints beside
 * a vegetarian dish.
 *
 * `@cogenta/theme-kit`'s `THEME_STRINGS` carries the dozen strings every
 * theme's blocks share; these belong to one register (a menu and a dish
 * page), so they live with the theme that draws them, in the two languages
 * the shared table knows. A locale the table does not know reads English, the
 * same rule `createThemeTranslator` follows.
 */

type MenuStringKey = 'price' | 'vegetarian' | 'details' | 'sourcing' | 'allergens' | 'pairing'

const STRINGS: Readonly<Record<'en' | 'fr', Readonly<Record<MenuStringKey, string>>>> = {
  en: {
    price: 'Price',
    vegetarian: 'Vegetarian',
    details: 'About the dish',
    sourcing: 'From',
    allergens: 'Allergens',
    pairing: 'To drink',
  },
  fr: {
    price: 'Prix',
    vegetarian: 'Végétarien',
    details: 'À propos du plat',
    sourcing: 'Provenance',
    allergens: 'Allergènes',
    pairing: 'À boire',
  },
}

export function menuString(
  locale: string,
  key: MenuStringKey,
  values?: Readonly<Record<string, string | number>>,
): string {
  return interpolate(STRINGS[themeLocaleFor(locale)][key], values)
}

export type { MenuStringKey }
