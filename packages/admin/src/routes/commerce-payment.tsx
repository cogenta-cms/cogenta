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

          <div className="grid gap-4 sm:grid-cols-2">
            {drivers.map((driver) => (
              <Card key={driver.name} aria-labelledby={`commerce-payment-${driver.name}-heading`}>
                <CardHeader>
                  <CardTitle>
                    <h2
                      id={`commerce-payment-${driver.name}-heading`}
                      className="flex items-center gap-2"
                    >
                      {t(`commercePayment.driver.${driver.name}`, { defaultValue: driver.name })}
                      {driver.selected === true && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {t('commercePayment.active')}
                        </span>
                      )}
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col gap-2 text-sm">
                  <p className="m-0">
                    {t('commercePayment.tier', {
                      tier: t(`commercePayment.tierName.${driver.tier}`),
                    })}
                  </p>
                  <p className="m-0">
                    {driver.configured
                      ? t('commercePayment.keyPresent')
                      : t('commercePayment.keyAbsent')}
                  </p>
                  <p className="m-0 text-muted-foreground">
                    {driver.settlesOffline
                      ? t('commercePayment.settlesOffline')
                      : t('commercePayment.settlesOnline')}
                  </p>
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
                  {results[driver.name] !== undefined && (
                    <p
                      role="status"
                      className={
                        results[driver.name]?.ok
                          ? 'm-0 text-success'
                          : 'm-0 font-medium text-destructive'
                      }
                    >
                      {results[driver.name]?.ok
                        ? t('commercePayment.testOk')
                        : (results[driver.name]?.message ?? t('commercePayment.testFailed'))}
                    </p>
                  )}
                </CardBody>
              </Card>
            ))}
            {drivers.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('commercePayment.empty')}</p>
            )}
          </div>

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
