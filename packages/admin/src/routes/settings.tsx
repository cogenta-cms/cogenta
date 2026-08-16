import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { SUPPORTED_LANGUAGES, type SupportedLanguage, setLanguage } from '../i18n/index.js'
import { Card, CardBody, CardHeader, CardTitle, Field, Select } from '../ui/index.js'

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = { fr: 'Français', en: 'English' }

/**
 * Interface preferences. One thing today: the language (ADR-0019), which is a
 * preference of whoever is signed in rather than a property of the site's
 * content.
 *
 * Passkey registration used to live here. L11 task 3 moved it to "my profile",
 * next to TOTP, the password and the active sessions: "manage my second factor"
 * split across two screens was exactly the sort of thing that makes people give
 * up before they find it — which matters more now that MFA is recommended
 * rather than forced (ADR-0021).
 */
export function SettingsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const email = auth.state.status === 'authenticated' ? auth.state.user.email : null

  return (
    <section aria-labelledby="settings-heading" className="flex flex-col gap-6">
      <h1 id="settings-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('settings.heading')}
      </h1>
      {email !== null && (
        <p className="m-0 text-sm text-muted-foreground">{t('settings.signedInAs', { email })}</p>
      )}

      <Card aria-labelledby="settings-language-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="settings-language-heading">{t('settings.languageHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="max-w-xs">
            <Field label={t('settings.languageLabel')}>
              {(control) => (
                <Select
                  {...control}
                  value={i18n.language}
                  onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
                >
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <option key={language} value={language}>
                      {LANGUAGE_NAMES[language]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </CardBody>
      </Card>

      <p className="m-0 text-sm">
        <Link to="/profile" className="text-primary underline-offset-2 hover:underline">
          {t('settings.securityMoved')}
        </Link>
      </p>
    </section>
  )
}
