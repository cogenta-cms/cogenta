/**
 * The handful of visitor-facing words this theme prints on its own, beyond
 * `THEME_STRINGS` (`@cogenta/theme-kit`): the label of a recommended plan,
 * the words behind a check mark in a plan comparison, and the name of a
 * "read more" link. Two languages, like the shared table, and English for
 * anything else.
 */

const STRINGS = {
  en: {
    recommended: 'Recommended',
    included: 'Included',
    notIncluded: 'Not included',
    plans: 'Plans',
    compare: 'Plan comparison',
    feature: 'Feature',
    readMore: 'Read more',
    about: 'about',
  },
  fr: {
    recommended: 'Recommandé',
    included: 'Inclus',
    notIncluded: 'Non inclus',
    plans: 'Formules',
    compare: 'Comparaison des formules',
    feature: 'Fonction',
    readMore: 'Lire la suite',
    about: 'sur',
  },
} as const

export type ThemeWord = keyof (typeof STRINGS)['en']

export function word(locale: string, key: ThemeWord): string {
  const language = locale.toLowerCase().split(/[-_]/)[0]
  return language === 'fr' ? STRINGS.fr[key] : STRINGS.en[key]
}
