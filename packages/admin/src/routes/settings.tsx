import { type FormEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, registerPasskey } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { SUPPORTED_LANGUAGES, type SupportedLanguage, setLanguage } from '../i18n/index.js'

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = { fr: 'Français', en: 'English' }

/**
 * L2 task 3's remaining half: login.tsx already covers passkeys as the
 * primary sign-in method, but adding one to an already-signed-in account
 * needs its own surface — this is that surface, the "settings page" that
 * comment forward-referenced. Also the one place ADR-0019's language
 * switcher lives — the interface's language is a preference of whoever is
 * signed in, not a property of the site's content.
 */
export function SettingsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const email = auth.state.status === 'authenticated' ? auth.state.user.email : null

  const [label, setLabel] = useState('')
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setError(null)
    setSuccess(false)
    setRegistering(true)
    try {
      await registerPasskey(token, label === '' ? undefined : label)
      setSuccess(true)
      setLabel('')
    } catch (caught) {
      // A cancelled browser prompt throws too — same reasoning as login.tsx's
      // passkey path, "try again" covers both that and a genuine failure.
      setError(caught instanceof ApiError ? caught.message : t('settings.passkeyRefused'))
    } finally {
      setRegistering(false)
    }
  }

  return (
    <section aria-labelledby="settings-heading">
      <h1 id="settings-heading">{t('settings.heading')}</h1>
      {email !== null && <p>{t('settings.signedInAs', { email })}</p>}

      <section aria-labelledby="settings-language-heading">
        <h2 id="settings-language-heading">{t('settings.languageHeading')}</h2>
        <label htmlFor="settings-language">{t('settings.languageLabel')}</label>
        <select
          id="settings-language"
          value={i18n.language}
          onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
        >
          {SUPPORTED_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {LANGUAGE_NAMES[language]}
            </option>
          ))}
        </select>
      </section>

      <section aria-labelledby="settings-passkey-heading">
        <h2 id="settings-passkey-heading">{t('settings.passkeysHeading')}</h2>
        <p>{t('settings.passkeysIntro')}</p>
        <form onSubmit={submit} aria-labelledby="settings-passkey-heading">
          <label htmlFor="passkey-label">{t('settings.passkeyLabelField')}</label>
          <input
            id="passkey-label"
            name="passkey-label"
            placeholder={t('settings.passkeyLabelPlaceholder')}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          {error !== null && (
            <p role="alert" className="auth-form__error">
              {error}
            </p>
          )}
          {success && <p role="status">{t('settings.passkeyAdded')}</p>}
          <button type="submit" disabled={registering}>
            {registering ? t('settings.passkeySubmitting') : t('settings.passkeySubmit')}
          </button>
        </form>
      </section>
    </section>
  )
}
