import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  readSecurityStatus,
  readWebhooksStatus,
  type SecurityStatus,
  type WebhooksStatus,
} from '../api/ops-status-client.js'
import { useAuth } from '../auth/auth-context.js'
import { Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

/**
 * `GET /api/security-status` and `GET /api/webhooks-status` — read-only
 * mirrors of the site's own `cogenta.config.mjs` (audit follow-up to L10
 * task 6 and L14 task 1).
 *
 * **Deliberately read-only, not merely unfinished.** Both settings live in
 * the site's configuration file — versioned in git, deployed with the code
 * that depends on it (a CSP that allows a script host has to travel with the
 * deploy that added the script). Letting this screen write them back would
 * create a second source of truth that disagrees with the file the moment
 * either one changes without the other; that is a bigger architecture change
 * than this audit's scope. What the screen proves instead is that what the
 * process is actually enforcing on every request matches what the file says
 * — which is worth seeing without opening a terminal.
 */
export function OpsSettingsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [security, setSecurity] = useState<SecurityStatus | null>(null)
  const [webhooks, setWebhooks] = useState<WebhooksStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token === null || !isAdmin) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([readSecurityStatus(token), readWebhooksStatus(token)])
      .then(([securityStatus, webhooksStatus]) => {
        if (cancelled) return
        setSecurity(securityStatus)
        setWebhooks(webhooksStatus)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof ApiError ? caught.message : t('opsSettings.loadError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, isAdmin, t])

  if (!isAdmin) {
    return (
      <section aria-labelledby="ops-settings-heading">
        <h1 id="ops-settings-heading">{t('opsSettings.heading')}</h1>
        <p role="alert">{t('opsSettings.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="ops-settings-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="ops-settings-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('opsSettings.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('opsSettings.description')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {security !== null && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('opsSettings.securityHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-medium">{t('opsSettings.corsLabel')}</dt>
              <dd className="m-0">
                {security.cors.enabled
                  ? t('opsSettings.corsEnabled', { origins: security.cors.origins.join(', ') })
                  : t('opsSettings.corsDisabled')}
              </dd>

              <dt className="font-medium">{t('opsSettings.cspLabel')}</dt>
              <dd className="m-0 font-mono break-all">
                {security.csp === null || security.csp === false
                  ? t('opsSettings.cspNone')
                  : security.csp}
              </dd>

              <dt className="font-medium">{t('opsSettings.hstsLabel')}</dt>
              <dd className="m-0">
                {security.hsts.enabled
                  ? t('opsSettings.hstsEnabled', { maxAge: security.hsts.maxAge })
                  : t('opsSettings.hstsDisabled')}
              </dd>

              <dt className="font-medium">{t('opsSettings.pageCacheLabel')}</dt>
              <dd className="m-0">
                {security.pageMaxAge === 0
                  ? t('opsSettings.pageCacheNone')
                  : t('opsSettings.pageCacheSeconds', { seconds: security.pageMaxAge })}
              </dd>
            </dl>
          </CardBody>
        </Card>
      )}

      {webhooks !== null && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('opsSettings.webhooksHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {webhooks.endpoints.length === 0 ? (
              <p className="m-0 text-sm">{t('opsSettings.webhooksNone')}</p>
            ) : (
              <>
                {webhooks.disabledForMissingSecret && (
                  <Notice tone="warning">
                    <p>{t('opsSettings.webhooksMissingSecret')}</p>
                  </Notice>
                )}
                <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-sm">
                  {webhooks.endpoints.map((endpoint) => (
                    <li key={endpoint}>{endpoint}</li>
                  ))}
                </ul>
                <p className="m-0 text-sm">
                  {webhooks.signed
                    ? t('opsSettings.webhooksSigned')
                    : t('opsSettings.webhooksUnsigned')}
                </p>
              </>
            )}
            <p className="text-muted-foreground m-0 text-sm">
              {t('opsSettings.webhooksHistoryUnavailable')}
            </p>
          </CardBody>
        </Card>
      )}

      <p className="text-muted-foreground text-sm">{t('opsSettings.readOnlyNote')}</p>
    </section>
  )
}
