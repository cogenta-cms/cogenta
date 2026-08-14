import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import fr from './locales/fr.json'

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
// French is the interface's only language up to this point (ADR-0019) — an
// existing install with no stored preference and a browser locale outside
// {fr, en} keeps exactly the text it already had, rather than switching to
// English out from under it.
const DEFAULT_LANGUAGE: SupportedLanguage = 'fr'

/**
 * ADR-0019: the admin UI's language is a preference of the person
 * administering the site, independent of `@cogenta/schema`'s content
 * locales (ADR-0014) — a different `localStorage` key than the session
 * token, so signing out never resets it.
 */
const LANGUAGE_STORAGE_KEY = 'cogenta.admin.language'

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

function detectLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored !== null && isSupportedLanguage(stored)) return stored

  const browserLanguage = navigator.language.slice(0, 2).toLowerCase()
  return isSupportedLanguage(browserLanguage) ? browserLanguage : DEFAULT_LANGUAGE
}

export function setLanguage(language: SupportedLanguage): void {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  void i18next.changeLanguage(language)
}

void i18next.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
})

export { i18next }
