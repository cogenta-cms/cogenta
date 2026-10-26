import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchInvoicePreviewPdf, listOrders, type Order } from '../api/commerce-client.js'
import { describeApiError } from '../api/describe-error.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { commerceErrorMessage } from '../commerce/commerce-errors.js'
import { countryName, countryOptions } from '../commerce/countries.js'
import {
  currencyOptions,
  majorTextToMinor,
  minorToMajorText,
  minorUnitExponent,
} from '../commerce/money.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Notice,
  Select,
} from '../ui/index.js'

const TEXTAREA_CLASSES =
  'w-full appearance-none rounded-md border border-input bg-card px-3 py-2 font-sans text-sm ' +
  'leading-5 text-card-foreground shadow-card transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'aria-invalid:border-destructive disabled:cursor-default disabled:opacity-60'

const SERIES_PREFIX = /^[A-Za-z0-9-]*$/u

interface Values {
  currency: string
  priceDisplay: string
  countries: readonly string[]
  minOrder: string
  allowBackorder: boolean
  tosPath: string
  returnPath: string
  sellerName: string
  sellerAddress: string
  sellerTaxId: string
  sellerFooter: string
  seriesPrefix: string
  paymentTerms: string
  language: string
}

type CardId = 'general' | 'legal' | 'seller' | 'invoice'

function str(settings: readonly SiteSetting[], key: string, fallback = ''): string {
  const found = settings.find((setting) => setting.key === key)
  return typeof found?.value === 'string' ? found.value : fallback
}

function valuesFrom(settings: readonly SiteSetting[]): Values {
  const currency = str(settings, 'commerce.currency', 'EUR')
  const minOrder = settings.find(
    (setting) => setting.key === 'commerce.minOrderSubtotalMinor',
  )?.value
  const backorder = settings.find(
    (setting) => setting.key === 'commerce.allowBackorderDefault',
  )?.value
  return {
    currency,
    priceDisplay: str(settings, 'commerce.priceDisplay', 'ttc'),
    countries: str(settings, 'commerce.countriesServed')
      .split(',')
      .map((code) => code.trim())
      .filter((code) => code !== ''),
    minOrder:
      typeof minOrder === 'number' && minOrder > 0 ? minorToMajorText(minOrder, currency) : '',
    allowBackorder: backorder === true,
    tosPath: str(settings, 'commerce.tosPagePath'),
    returnPath: str(settings, 'commerce.returnPolicyPagePath'),
    sellerName: str(settings, 'commerce.sellerLegalName'),
    sellerAddress: str(settings, 'commerce.sellerAddress'),
    sellerTaxId: str(settings, 'commerce.sellerTaxId'),
    sellerFooter: str(settings, 'commerce.sellerFooter'),
    seriesPrefix: str(settings, 'commerce.invoiceSeriesPrefix'),
    paymentTerms: str(settings, 'commerce.invoicePaymentTerms'),
    language: str(settings, 'commerce.invoiceLanguage', 'fr'),
  }
}

/** Whether a site page answers at `path` — the public site shares the admin's origin. */
async function pageExists(path: string): Promise<boolean> {
  try {
    const response = await fetch(path, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Store settings — fiche 34 tasks 4 and 5. Each card has its own *Enregistrer*
 * button: nothing is saved by leaving a field, and an invalid value is refused
 * here, in French, before it ever reaches the server. Amounts are typed in
 * euros (or the shop's currency), never in "minor units".
 *
 * CGV and the return policy are deliberately **paths to real content entries**
 * (fiche 34 § pièges: "les CGV doivent être une page publique") — this screen
 * checks that the page answers and warns when it does not.
 */
export function CommerceSettingsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [values, setValues] = useState<Values | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<CardId | null>(null)
  const [savedCard, setSavedCard] = useState<CardId | null>(null)
  const [cardErrors, setCardErrors] = useState<Readonly<Record<string, string>>>({})
  const [cardFailure, setCardFailure] = useState<{ card: CardId; message: string } | null>(null)
  const [warnings, setWarnings] = useState<Readonly<Record<string, string>>>({})
  const [pickCountry, setPickCountry] = useState('')

  const [orders, setOrders] = useState<readonly Order[]>([])
  const [previewOrderId, setPreviewOrderId] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const countries = useMemo(() => countryOptions(i18n.language), [i18n.language])

  const load = useCallback(async () => {
    if (!isAdmin || token === null) return
    try {
      const data = await listSettings(undefined, token)
      const loaded = valuesFrom(data.filter((setting) => setting.group === 'commerce'))
      setValues(loaded)
      setError(null)
    } catch (caught) {
      setError(describeApiError(caught, t('settings.loadError')).message)
    }
  }, [isAdmin, token, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!isAdmin || token === null) return
    listOrders(token, undefined, undefined, undefined, { limit: 30 })
      .then((response) => setOrders(response.orders))
      .catch(() => setOrders([]))
  }, [isAdmin, token])

  function update<K extends keyof Values>(key: K, value: Values[K]): void {
    setValues((current) => (current === null ? current : { ...current, [key]: value }))
    setSavedCard(null)
  }

  async function saveCard(card: CardId): Promise<void> {
    if (token === null || values === null) return
    const found: Record<string, string> = {}
    const writes: [string, unknown][] = []

    if (card === 'general') {
      if (!/^[A-Z]{3}$/u.test(values.currency))
        found['currency'] = t('commerceSettings.currencyInvalid')
      let minOrderMinor = 0
      if (values.minOrder.trim() !== '') {
        const parsed = majorTextToMinor(values.minOrder, values.currency)
        if (parsed === null) found['minOrder'] = t('commerceSettings.minOrderInvalid')
        else minOrderMinor = parsed
      }
      writes.push(
        ['commerce.currency', values.currency],
        ['commerce.priceDisplay', values.priceDisplay],
        ['commerce.countriesServed', values.countries.join(', ')],
        ['commerce.minOrderSubtotalMinor', minOrderMinor],
        ['commerce.allowBackorderDefault', values.allowBackorder],
      )
    } else if (card === 'legal') {
      for (const [field, key, value] of [
        ['tosPath', 'commerce.tosPagePath', values.tosPath],
        ['returnPath', 'commerce.returnPolicyPagePath', values.returnPath],
      ] as const) {
        const trimmed = value.trim()
        if (trimmed !== '' && !trimmed.startsWith('/'))
          found[field] = t('commerceSettings.pathInvalid')
        writes.push([key, trimmed])
      }
    } else if (card === 'seller') {
      writes.push(
        ['commerce.sellerLegalName', values.sellerName.trim()],
        ['commerce.sellerAddress', values.sellerAddress.trim()],
        ['commerce.sellerTaxId', values.sellerTaxId.trim()],
        ['commerce.sellerFooter', values.sellerFooter.trim()],
      )
      if (values.sellerName.trim() !== '' && values.sellerAddress.trim() === '') {
        found['sellerAddress'] = t('commerceSettings.sellerAddressRequired')
      }
      if (values.sellerName.trim() === '' && values.sellerAddress.trim() !== '') {
        found['sellerName'] = t('commerceSettings.sellerNameRequired')
      }
    } else {
      if (!SERIES_PREFIX.test(values.seriesPrefix.trim())) {
        found['seriesPrefix'] = t('commerceSettings.seriesInvalid')
      }
      writes.push(
        ['commerce.invoiceSeriesPrefix', values.seriesPrefix.trim()],
        ['commerce.invoicePaymentTerms', values.paymentTerms.trim()],
        ['commerce.invoiceLanguage', values.language],
      )
    }

    setCardErrors(found)
    setCardFailure(null)
    if (Object.keys(found).length > 0) return

    setSaving(card)
    try {
      const nextWarnings: Record<string, string> = {}
      for (const [key, value] of writes) {
        await writeSetting(token, key, value)
      }
      if (card === 'legal') {
        for (const [field, value] of [
          ['tosPath', values.tosPath.trim()],
          ['returnPath', values.returnPath.trim()],
        ] as const) {
          if (value !== '' && !(await pageExists(value))) {
            nextWarnings[field] = t('commerceSettings.pageMissing', { path: value })
          }
        }
      }
      setWarnings(nextWarnings)
      setSavedCard(card)
      await load()
    } catch (caught) {
      setCardFailure({
        card,
        message: describeApiError(caught, t('commerceSettings.saveError')).message,
      })
    } finally {
      setSaving(null)
    }
  }

  async function previewInvoice(): Promise<void> {
    if (token === null || previewOrderId === '') return
    setPreviewing(true)
    setPreviewError(null)
    try {
      const blob = await fetchInvoicePreviewPdf(token, previewOrderId)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      // The object URL only needs to outlive the tab's own load of it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (caught) {
      setPreviewError(commerceErrorMessage(t, caught, 'commerceSettings.invoicePreviewError'))
    } finally {
      setPreviewing(false)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="commerce-settings-heading">
        <h1 id="commerce-settings-heading">{t('commerceSettings.heading')}</h1>
        <p role="alert">{t('commerceSettings.adminOnly')}</p>
      </section>
    )
  }

  const sellerFilled =
    values !== null && values.sellerName.trim() !== '' && values.sellerAddress.trim() !== ''
  const exponent = minorUnitExponent(values?.currency ?? 'EUR')

  const saveRow = (card: CardId): JSX.Element => (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={saving !== null} onClick={() => void saveCard(card)}>
        {saving === card ? t('common.saving') : t('commerceSettings.save')}
      </Button>
      {savedCard === card && (
        <span role="status" className="text-sm text-success">
          {t('commerceSettings.saved')}
        </span>
      )}
      {cardFailure?.card === card && (
        <span role="alert" className="text-sm font-medium text-destructive">
          {cardFailure.message}
        </span>
      )}
    </div>
  )

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

      {values !== null && (
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
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('settings.field.commerce.currency.label')}
                  description={t('commerceSettings.currencyHint')}
                  error={cardErrors['currency'] ?? null}
                >
                  {(control) => (
                    <Select
                      {...control}
                      value={values.currency}
                      onChange={(event) => update('currency', event.target.value)}
                    >
                      {currencyOptions(i18n.language, [values.currency]).map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field
                  label={t('settings.field.commerce.priceDisplay.label')}
                  description={t('settings.field.commerce.priceDisplay.help')}
                >
                  {(control) => (
                    <Select
                      {...control}
                      value={values.priceDisplay}
                      onChange={(event) => update('priceDisplay', event.target.value)}
                    >
                      <option value="ttc">
                        {t('settings.field.commerce.priceDisplay.options.ttc')}
                      </option>
                      <option value="ht">
                        {t('settings.field.commerce.priceDisplay.options.ht')}
                      </option>
                    </Select>
                  )}
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <Field
                  label={t('settings.field.commerce.countriesServed.label')}
                  description={t('commerceSettings.countriesHint')}
                >
                  {(control) => (
                    <Select
                      {...control}
                      value={pickCountry}
                      onChange={(event) => {
                        const code = event.target.value
                        if (code !== '' && !values.countries.includes(code)) {
                          update('countries', [...values.countries, code])
                        }
                        setPickCountry('')
                      }}
                    >
                      <option value="">{t('commerceSettings.addCountry')}</option>
                      {countries
                        .filter((option) => !values.countries.includes(option.code))
                        .map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.name}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
                {values.countries.length === 0 ? (
                  <p className="m-0 text-xs text-muted-foreground">
                    {t('commerceSettings.allCountries')}
                  </p>
                ) : (
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {values.countries.map((code) => (
                      <li
                        key={code}
                        className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-3 text-sm"
                      >
                        {countryName(code, i18n.language)}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          aria-label={t('commerceSettings.removeCountry', {
                            name: countryName(code, i18n.language),
                          })}
                          onClick={() =>
                            update(
                              'countries',
                              values.countries.filter((entry) => entry !== code),
                            )
                          }
                        >
                          ×
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Field
                label={t('settings.field.commerce.minOrderSubtotalMinor.label')}
                description={t('commerceSettings.minOrderHint', {
                  example: `${5}${exponent > 0 ? ',00' : ''}`,
                })}
                error={cardErrors['minOrder'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={values.minOrder}
                    onChange={(event) => update('minOrder', event.target.value)}
                  />
                )}
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={values.allowBackorder}
                  onChange={(event) => update('allowBackorder', event.target.checked)}
                />
                <span>
                  <span className="font-medium">
                    {t('settings.field.commerce.allowBackorderDefault.label')}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t('settings.field.commerce.allowBackorderDefault.help')}
                  </span>
                </span>
              </label>
              {saveRow('general')}
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
              <Field
                label={t('settings.field.commerce.tosPagePath.label')}
                description={t('settings.field.commerce.tosPagePath.help')}
                error={cardErrors['tosPath'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    value={values.tosPath}
                    placeholder="/cgv"
                    onChange={(event) => update('tosPath', event.target.value)}
                  />
                )}
              </Field>
              {warnings['tosPath'] !== undefined && (
                <Notice tone="warning" live="polite">
                  <p>{warnings['tosPath']}</p>
                </Notice>
              )}
              <Field
                label={t('settings.field.commerce.returnPolicyPagePath.label')}
                description={t('settings.field.commerce.returnPolicyPagePath.help')}
                error={cardErrors['returnPath'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    value={values.returnPath}
                    placeholder="/retours"
                    onChange={(event) => update('returnPath', event.target.value)}
                  />
                )}
              </Field>
              {warnings['returnPath'] !== undefined && (
                <Notice tone="warning" live="polite">
                  <p>{warnings['returnPath']}</p>
                </Notice>
              )}
              {saveRow('legal')}
            </CardBody>
          </Card>

          <Card aria-labelledby="commerce-settings-seller-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="commerce-settings-seller-heading">{t('commerceSettings.sellerHeading')}</h2>
              </CardTitle>
              <Badge className="w-fit" tone={sellerFilled ? 'success' : 'warning'}>
                {sellerFilled
                  ? t('commerceSettings.sellerReady')
                  : t('commerceSettings.sellerMissing')}
              </Badge>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <p className="m-0 text-sm text-muted-foreground">
                {t('commerceSettings.sellerHint')}
              </p>
              <Field
                label={t('commerceSettings.sellerName')}
                error={cardErrors['sellerName'] ?? null}
              >
                {(control) => (
                  <Input
                    {...control}
                    autoComplete="organization"
                    value={values.sellerName}
                    onChange={(event) => update('sellerName', event.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('commerceSettings.sellerAddress')}
                description={t('commerceSettings.sellerAddressHint')}
                error={cardErrors['sellerAddress'] ?? null}
              >
                {(control) => (
                  <textarea
                    {...control}
                    rows={4}
                    className={TEXTAREA_CLASSES}
                    value={values.sellerAddress}
                    onChange={(event) => update('sellerAddress', event.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('commerceSettings.sellerTaxId')}
                description={t('commerceSettings.sellerTaxIdHint')}
              >
                {(control) => (
                  <Input
                    {...control}
                    value={values.sellerTaxId}
                    onChange={(event) => update('sellerTaxId', event.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('commerceSettings.sellerFooter')}
                description={t('commerceSettings.sellerFooterHint')}
              >
                {(control) => (
                  <textarea
                    {...control}
                    rows={2}
                    className={TEXTAREA_CLASSES}
                    value={values.sellerFooter}
                    onChange={(event) => update('sellerFooter', event.target.value)}
                  />
                )}
              </Field>
              {saveRow('seller')}
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
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('settings.field.commerce.invoiceSeriesPrefix.label')}
                  description={t('settings.field.commerce.invoiceSeriesPrefix.help')}
                  error={cardErrors['seriesPrefix'] ?? null}
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={values.seriesPrefix}
                      onChange={(event) => update('seriesPrefix', event.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label={t('settings.field.commerce.invoiceLanguage.label')}
                  description={t('settings.field.commerce.invoiceLanguage.help')}
                >
                  {(control) => (
                    <Select
                      {...control}
                      value={values.language}
                      onChange={(event) => update('language', event.target.value)}
                    >
                      <option value="fr">Français</option>
                      <option value="en">English</option>
                    </Select>
                  )}
                </Field>
              </div>
              <Field
                label={t('settings.field.commerce.invoicePaymentTerms.label')}
                description={t('settings.field.commerce.invoicePaymentTerms.help')}
              >
                {(control) => (
                  <textarea
                    {...control}
                    rows={2}
                    className={TEXTAREA_CLASSES}
                    value={values.paymentTerms}
                    onChange={(event) => update('paymentTerms', event.target.value)}
                  />
                )}
              </Field>
              <Notice tone="warning" live="off">
                <p className="m-0 text-sm">{t('commerceSettings.seriesWarning')}</p>
              </Notice>
              {saveRow('invoice')}

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <h3 className="m-0 text-sm font-semibold">
                  {t('commerceSettings.invoicePreviewHeading')}
                </h3>
                <p className="m-0 text-sm text-muted-foreground">
                  {t('commerceSettings.invoicePreviewHint')}
                </p>
                {orders.length === 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">
                    {t('commerceSettings.invoicePreviewNoOrders')}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label={t('commerceSettings.invoicePreviewOrderId')} className="min-w-64">
                      {(control) => (
                        <Select
                          {...control}
                          value={previewOrderId}
                          onChange={(event) => setPreviewOrderId(event.target.value)}
                        >
                          <option value="">{t('commerceSettings.invoicePreviewChoose')}</option>
                          {orders.map((order) => (
                            <option key={order.id} value={order.id}>
                              {order.reference} — {order.email}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={previewing || previewOrderId === ''}
                      onClick={() => void previewInvoice()}
                    >
                      {previewing
                        ? t('commerceSettings.invoicePreviewing')
                        : t('commerceSettings.invoicePreviewButton')}
                    </Button>
                  </div>
                )}
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
