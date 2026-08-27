import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  listPaymentDrivers,
  type PaymentDriverStatus,
  testPaymentConnection,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import { useAuth } from '../auth/auth-context.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

/**
 * Payment — fiche 34 task 3.
 *
 * The one screen in this fiche where a mistake leaks money or a key
 * (fiche 34 § pièges: "un écran de paiement est une fuite de clé en
 * puissance"). Nothing here can render a key: `PaymentDriverStatus.configured`
 * is a boolean the server computed by calling the driver's own `available()`
 * probe — never a value round-tripped from a secret. Test mode is shown in a
 * banner large enough that it cannot be missed ("le mode test doit être
 * criant").
 */
export function CommercePaymentRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [drivers, setDrivers] = useState<readonly PaymentDriverStatus[]>([])
  const [testMode, setTestMode] = useState(true)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<
    Readonly<Record<string, { readonly ok: boolean; readonly message: string | null }>>
  >({})

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const status = await listPaymentDrivers(token)
      setDrivers(status.drivers)
      setTestMode(status.testMode)
      setWebhookUrl(status.webhookUrl)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commercePayment.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function runTest(name: string): Promise<void> {
    if (token === null) return
    setTesting(name)
    try {
      const result = await testPaymentConnection(token, name)
      setResults((current) => ({ ...current, [name]: result }))
    } catch (caught) {
      setResults((current) => ({
        ...current,
        [name]: {
          ok: false,
          message: caught instanceof ApiError ? caught.message : t('commercePayment.testError'),
        },
      }))
    } finally {
      setTesting(null)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="commerce-payment-heading">
        <h1 id="commerce-payment-heading">{t('commercePayment.heading')}</h1>
        <p role="alert">{t('commercePayment.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="commerce-payment-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="commerce-payment-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('commercePayment.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('commercePayment.description')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <>
          <Notice tone={testMode ? 'warning' : 'success'} live="polite">
            <p className="font-semibold">
              {testMode ? t('commercePayment.testModeOn') : t('commercePayment.testModeOff')}
            </p>
            <p className="m-0 text-sm">
              {testMode
                ? t('commercePayment.testModeOnHint')
                : t('commercePayment.testModeOffHint')}
            </p>
          </Notice>

          {/*
           * A list of registered providers, not a fixed pair of cards — the
           * point being made visually, not just structurally: `drivers` comes
           * straight from `GET /payment/drivers`, which itself just echoes
           * `registry.list()` (`@cogenta/commerce`'s `PaymentRegistry`). A
           * third driver registered there (PayPal, alongside Stripe and bank
           * transfer) appears here with no change to this component, the way
           * a WooCommerce install lists "Payment providers" as an open-ended
           * roster rather than a hard-coded left/right pair.
           */}
          <Card aria-labelledby="commerce-payment-providers-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="commerce-payment-providers-heading">
                  {t('commercePayment.providersHeading')}
                </h2>
              </CardTitle>
              <p className="m-0 text-sm text-muted-foreground">
                {t('commercePayment.providersHint')}
              </p>
            </CardHeader>
            <CardBody className="p-0">
              {drivers.length === 0 ? (
                <p className="m-0 p-4 text-sm text-muted-foreground">
                  {t('commercePayment.empty')}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                  {drivers.map((driver) => (
                    <li
                      key={driver.name}
                      aria-labelledby={`commerce-payment-${driver.name}-heading`}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-1">
                        <h3
                          id={`commerce-payment-${driver.name}-heading`}
                          className="m-0 flex flex-wrap items-center gap-2 text-base font-semibold"
                        >
                          {t(`commercePayment.driver.${driver.name}`, {
                            defaultValue: driver.name,
                          })}
                          {driver.selected === true && (
                            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {t('commercePayment.active')}
                            </span>
                          )}
                          <span
                            className={
                              driver.configured
                                ? 'rounded bg-success-surface px-2 py-0.5 text-xs font-medium text-success'
                                : 'rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                            }
                          >
                            {driver.configured
                              ? t('commercePayment.keyPresent')
                              : t('commercePayment.keyAbsent')}
                          </span>
                        </h3>
                        <p className="m-0 text-sm text-muted-foreground">
                          {t('commercePayment.tier', {
                            tier: t(`commercePayment.tierName.${driver.tier}`),
                          })}
                          {' — '}
                          {driver.settlesOffline
                            ? t('commercePayment.settlesOffline')
                            : t('commercePayment.settlesOnline')}
                        </p>
                        {results[driver.name] !== undefined && (
                          <p
                            role="status"
                            className={
                              results[driver.name]?.ok
                                ? 'm-0 text-sm text-success'
                                : 'm-0 text-sm font-medium text-destructive'
                            }
                          >
                            {results[driver.name]?.ok
                              ? t('commercePayment.testOk')
                              : (results[driver.name]?.message ?? t('commercePayment.testFailed'))}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={testing === driver.name}
                        onClick={() => void runTest(driver.name)}
                      >
                        {testing === driver.name
                          ? t('commercePayment.testing')
                          : t('commercePayment.testConnection')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card aria-labelledby="commerce-payment-webhook-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="commerce-payment-webhook-heading">{t('commercePayment.webhookHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-2 text-sm">
              {webhookUrl === null ? (
                <p className="m-0 text-muted-foreground">{t('commercePayment.webhookNone')}</p>
              ) : (
                <>
                  <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{webhookUrl}</code>
                  <p className="m-0 text-muted-foreground">
                    {t('commercePayment.webhookNotWired')}
                  </p>
                </>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </section>
  )
}
