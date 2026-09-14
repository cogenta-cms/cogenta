import { interpolate, themeLocaleFor } from '@cogenta/theme-kit'

/**
 * The few words a charity's own pages need that the shared vocabulary does
 * not: the labels of an event's or a programme's details, the menu button,
 * and the joining words of a time range.
 *
 * `@cogenta/theme-kit`'s `THEME_STRINGS` carries the strings every theme's
 * blocks share; these belong to one register, so they live with the theme
 * that draws them, in the two languages the shared table knows. A locale the
 * table does not know reads English, the same rule `createThemeTranslator`
 * follows.
 */

type AssociationStringKey =
  | 'when'
  | 'where'
  | 'address'
  | 'cost'
  | 'booking'
  | 'audience'
  | 'contact'
  | 'details'
  | 'timeRange'
  | 'menu'
  | 'close'
  | 'primaryNav'
  | 'footerNav'
  | 'share'

const STRINGS: Readonly<Record<'en' | 'fr', Readonly<Record<AssociationStringKey, string>>>> = {
  en: {
    when: 'When',
    where: 'Where',
    address: 'Address',
    cost: 'Cost',
    booking: 'Booking',
    audience: 'Who it is for',
    contact: 'Contact',
    details: 'Details',
    timeRange: '{{start}} to {{end}}',
    menu: 'Menu',
    close: 'Close',
    primaryNav: 'Primary',
    footerNav: 'Footer',
    share: 'Share of the total',
  },
  fr: {
    when: 'Quand',
    where: 'Où',
    address: 'Adresse',
    cost: 'Tarif',
    booking: 'Inscription',
    audience: 'Pour qui',
    contact: 'Contact',
    details: 'Informations pratiques',
    timeRange: 'de {{start}} à {{end}}',
    menu: 'Menu',
    close: 'Fermer',
    primaryNav: 'Navigation principale',
    footerNav: 'Pied de page',
    share: 'Part du total',
  },
}

export function associationString(
  locale: string,
  key: AssociationStringKey,
  values?: Readonly<Record<string, string | number>>,
): string {
  return interpolate(STRINGS[themeLocaleFor(locale)][key], values)
}

export type { AssociationStringKey }
