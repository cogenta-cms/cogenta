import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import fr from './locales/fr.json'

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
// English, in both senses `i18next` uses this for: the language an admin
// opens in when the browser asks for neither French nor English, and the one
// a missing key falls back to.
//
// It was French, with a reason that has expired: French was the interface's
// only language, so falling back to it could not surprise anybody. With two,
// it does — an English admin met French words wherever a key was missing,
// which is the one place a fallback is guaranteed to be read. English is also
// the language of this codebase's identifiers, comments and shipped schemas,
// so a string that has not been translated yet at least matches its source.
const DEFAULT_LANGUAGE: SupportedLanguage = 'en'

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

/**
 * The interface language this account chose, applied wherever they sign in.
 *
 * `detectLanguage` reads this browser's `localStorage` and then
 * `navigator.language`, which is right for a first visit and wrong for a
 * second browser: the preference saved on the account — the only way to
 * change this language at all, through the Profile screen — was ignored
 * there, so a person who had chosen English signed in to French.
 *
 * The account wins over the cached copy rather than the other way round:
 * `localStorage` exists so the first paint is in the right language, and
 * the account is what the person actually stated. `null`, an unsupported
 * value, or a server too old to answer leave the language untouched.
 */
export function applyAccountLanguage(locale: string | null): void {
  if (locale === null) return
  const trimmed = locale.trim().toLowerCase()
  if (!isSupportedLanguage(trimmed)) return
  if (localStorage.getItem(LANGUAGE_STORAGE_KEY) === trimmed) return
  setLanguage(trimmed)
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
