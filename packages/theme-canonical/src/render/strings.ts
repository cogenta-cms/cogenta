import { themeLocaleFor } from '@cogenta/theme-kit'

/**
 * The few words this theme prints on its own, beyond `THEME_STRINGS`
 * (`@cogenta/theme-kit`): the name of the menu control and of the two
 * navigation landmarks, and the label over a recommended plan. The same two
 * languages as the shared table, resolved the same way (`fr-CA` is French,
 * anything unknown is English).
 */

const WORDS = {
  en: {
    menu: 'Menu',
    primaryNavigation: 'Primary',
    footerNavigation: 'Footer',
    recommended: 'Recommended',
  },
  fr: {
    menu: 'Menu',
    primaryNavigation: 'Principale',
    footerNavigation: 'Pied de page',
    recommended: 'Recommandé',
  },
} as const

export type ThemeWord = keyof (typeof WORDS)['en']

export function word(locale: string, key: ThemeWord): string {
  return WORDS[themeLocaleFor(locale)][key]
}
