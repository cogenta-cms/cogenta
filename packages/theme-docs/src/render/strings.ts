/**
 * The handful of visitor-facing words this theme prints on its own, beyond
 * `THEME_STRINGS` (`@cogenta/theme-kit`): the search field, the navigation
 * disclosures, the table of contents, previous and next, the date a page was
 * last changed. Two languages, like the shared table, and English for
 * anything else.
 */

const STRINGS = {
  en: {
    search: 'Search',
    searchLabel: 'Search the documentation',
    searchPlaceholder: 'Search the documentation',
    menu: 'Menu',
    documentation: 'Documentation',
    docsHome: 'Docs',
    breadcrumb: 'Breadcrumb',
    onThisPage: 'On this page',
    pager: 'Previous and next pages',
    previous: 'Previous',
    next: 'Next',
    lastUpdated: 'Last updated',
    recommended: 'Recommended',
    primary: 'Primary',
    footer: 'Footer',
  },
  fr: {
    search: 'Rechercher',
    searchLabel: 'Rechercher dans la documentation',
    searchPlaceholder: 'Rechercher dans la documentation',
    menu: 'Menu',
    documentation: 'Documentation',
    docsHome: 'Docs',
    breadcrumb: 'Fil d’Ariane',
    onThisPage: 'Sur cette page',
    pager: 'Pages précédente et suivante',
    previous: 'Précédent',
    next: 'Suivant',
    lastUpdated: 'Dernière mise à jour',
    recommended: 'Recommandé',
    primary: 'Principale',
    footer: 'Pied de page',
  },
} as const

export type ThemeWord = keyof (typeof STRINGS)['en']

export function word(locale: string, key: ThemeWord): string {
  const language = locale.toLowerCase().split(/[-_]/)[0]
  return language === 'fr' ? STRINGS.fr[key] : STRINGS.en[key]
}

/**
 * A documentation site is usually named "<product> Docs". The header sets the
 * product in ink and the word that says what the site is in the quieter grey,
 * and the copyright line names the product, not the word "Docs".
 */
const DOCS_SUFFIX = /^(.+?)\s+(docs|documentation|developer docs|developers|dev docs)$/i

export function splitSiteName(name: string): {
  readonly product: string
  readonly suffix: string | null
} {
  const match = DOCS_SUFFIX.exec(name.trim())
  if (match === null) return { product: name.trim(), suffix: null }
  return { product: match[1] as string, suffix: match[2] as string }
}
