import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

const GENERAL_KEYS = [
  'commerce.currency',
  'commerce.priceDisplay',
  'commerce.countriesServed',
  'commerce.minOrderSubtotalMinor',
  'commerce.allowBackorderDefault',
]

const LEGAL_KEYS = ['commerce.tosPagePath', 'commerce.returnPolicyPagePath']

const INVOICE_KEYS = [
  'commerce.invoiceSeriesPrefix',
  'commerce.invoicePaymentTerms',
  'commerce.invoiceLanguage',
]

/**
 * Store settings — fiche 34 tasks 4 and 5. General shop configuration and the
 * invoice template, both stored through the same generic editorial-settings
 * registry fiche 23 built (`commerce` is one more `group`, ADR-0025's third
 * category) — no new persistence layer for this fiche, only new registry
 * entries and this screen.
 *
 * CGV and the return policy are deliberately **paths to real content
 * entries**, not text fields here (fiche 34 § pièges: "les CGV doivent être
 * une page publique") — this screen only says where they live.
 */
export function CommerceSettingsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isAdmin) return
    try {
      const data = await listSettings()
      setSettings(data.filter((setting) => setting.group === 'commerce'))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.loadError'))
    }
  }, [isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function save(key: string, value: unknown): Promise<void> {
    if (token === null) return
    await writeSetting(token, key, value)
    await load()
  }

  function byKey(keys: readonly string[]): readonly SiteSetting[] {
    const found = new Map((settings ?? []).map((setting) => [setting.key, setting]))
    return keys
      .map((key) => found.get(key))
      .filter((setting): setting is SiteSetting => setting !== undefined)
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="commerce-settings-heading">
        <h1 id="commerce-settings-heading">{t('commerceSettings.heading')}</h1>
        <p role="alert">{t('commerceSettings.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="commerce-settings-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="commerce-settings-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('commerceSettings.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('commerceSettings.description')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      {settings !== null && (
        <>
          <Card aria-labelledby="commerce-settings-general-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="commerce-settings-general-heading">
                  {t('commerceSettings.generalHeading')}
                </h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {byKey(GENERAL_KEYS).map((setting) => (
                <SiteSettingsField
                  key={setting.key}
                  setting={setting}
                  canEdit
                  onSave={(value) => save(setting.key, value)}
                />
              ))}
            </CardBody>
          </Card>

          <Card aria-labelledby="commerce-settings-legal-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="commerce-settings-legal-heading">{t('commerceSettings.legalHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <p className="m-0 text-sm text-muted-foreground">{t('commerceSettings.legalHint')}</p>
              {byKey(LEGAL_KEYS).map((setting) => (
                <SiteSettingsField
                  key={setting.key}
                  setting={setting}
                  canEdit
                  onSave={(value) => save(setting.key, value)}
                />
              ))}
            </CardBody>
          </Card>

          <Card aria-labelledby="commerce-settings-invoice-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="commerce-settings-invoice-heading">
                  {t('commerceSettings.invoiceHeading')}
                </h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <p className="m-0 text-sm text-muted-foreground">
                {t('commerceSettings.invoiceHint')}
              </p>
              {byKey(INVOICE_KEYS).map((setting) => (
                <SiteSettingsField
                  key={setting.key}
                  setting={setting}
                  canEdit
                  onSave={(value) => save(setting.key, value)}
                />
              ))}
              <Notice tone="warning" live="off">
                <p className="m-0 text-sm">{t('commerceSettings.seriesWarning')}</p>
              </Notice>
              <p className="m-0 text-sm text-muted-foreground">
                {t('commerceSettings.invoicePreviewHint')}
              </p>
            </CardBody>
          </Card>
        </>
      )}
    </section>
  )
}
