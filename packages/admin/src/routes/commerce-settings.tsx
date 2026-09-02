import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchInvoicePreviewPdf } from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Notice } from '../ui/index.js'

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
  const [previewOrderId, setPreviewOrderId] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

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

  /**
   * A real preview, not a mock — `GET .../invoice/preview` renders the same
   * `documentFor`/`pdfDocumentFor`/`renderInvoicePdf` chain a real, issued
   * invoice does, on the order's live data, and never claims a real invoice
   * number in doing so (`InvoiceStore.preview`'s own comment in
   * `@cogenta/commerce`). Opened in a new tab rather than downloaded: a
   * preview is looked at, not filed.
   */
  async function previewInvoice(): Promise<void> {
    if (token === null || previewOrderId.trim() === '') return
    setPreviewing(true)
    setPreviewError(null)
    try {
      const blob = await fetchInvoicePreviewPdf(token, previewOrderId.trim())
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      // The object URL only needs to outlive the tab's own load of it; a
      // short delay is simpler and just as safe as tracking that load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (caught) {
      setPreviewError(
        caught instanceof ApiError ? caught.message : t('commerceSettings.invoicePreviewError'),
      )
    } finally {
      setPreviewing(false)
    }
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
        <h1
          id="commerce-settings-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
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

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <h3 className="m-0 text-sm font-semibold">
                  {t('commerceSettings.invoicePreviewHeading')}
                </h3>
                <p className="m-0 text-sm text-muted-foreground">
                  {t('commerceSettings.invoicePreviewHint')}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={t('commerceSettings.invoicePreviewOrderId')} className="min-w-64">
                    {(control) => (
                      <Input
                        {...control}
                        value={previewOrderId}
                        onChange={(event) => setPreviewOrderId(event.target.value)}
                        placeholder={t('commerceSettings.invoicePreviewOrderIdPlaceholder')}
                      />
                    )}
                  </Field>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={previewing || previewOrderId.trim() === ''}
                    onClick={() => void previewInvoice()}
                  >
                    {previewing
                      ? t('commerceSettings.invoicePreviewing')
                      : t('commerceSettings.invoicePreviewButton')}
                  </Button>
                </div>
                {previewError !== null && (
                  <Notice tone="danger" live="assertive">
                    <p className="m-0">{previewError}</p>
                  </Notice>
                )}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </section>
  )
}
