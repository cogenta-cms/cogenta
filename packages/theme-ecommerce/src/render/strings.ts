import { interpolate, themeLocaleFor } from '@cogenta/theme-kit'

/**
 * The few words a shop's own pages need that the shared vocabulary does not:
 * the stock status, the action under a price, the labels of a product's
 * details.
 *
 * `@cogenta/theme-kit`'s `THEME_STRINGS` carries the dozen strings every
 * theme's blocks share; these belong to one register (a product page), so
 * they live with the theme that draws that page, in the two languages the
 * shared table knows. A locale the table does not know reads English, the
 * same rule `createThemeTranslator` follows.
 */

type ShopStringKey =
  | 'price'
  | 'inStock'
  | 'soldOut'
  | 'orderByEmail'
  | 'askAboutNextBatch'
  | 'order'
  | 'details'
  | 'material'
  | 'dimensions'
  | 'weight'
  | 'capacity'
  | 'origin'
  | 'care'
  | 'delivery'

const STRINGS: Readonly<Record<'en' | 'fr', Readonly<Record<ShopStringKey, string>>>> = {
  en: {
    price: 'Price',
    inStock: 'In stock',
    soldOut: 'Sold out',
    orderByEmail: 'Order by email',
    askAboutNextBatch: 'Ask about the next batch',
    order: 'Order this piece',
    details: 'Details',
    material: 'Material',
    dimensions: 'Dimensions',
    weight: 'Weight',
    capacity: 'Capacity',
    origin: 'Made in',
    care: 'Care',
    delivery: 'Delivery',
  },
  fr: {
    price: 'Prix',
    inStock: 'En stock',
    soldOut: 'Épuisé',
    orderByEmail: 'Commander par e-mail',
    askAboutNextBatch: 'Demander la prochaine série',
    order: 'Commander cette pièce',
    details: 'Détails',
    material: 'Matière',
    dimensions: 'Dimensions',
    weight: 'Poids',
    capacity: 'Contenance',
    origin: 'Fabriqué à',
    care: 'Entretien',
    delivery: 'Livraison',
  },
}

export function shopString(
  locale: string,
  key: ShopStringKey,
  values?: Readonly<Record<string, string | number>>,
): string {
  return interpolate(STRINGS[themeLocaleFor(locale)][key], values)
}

export type { ShopStringKey }
