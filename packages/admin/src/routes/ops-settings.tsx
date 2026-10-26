import type { TFunction } from 'i18next'
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type ConfigStatus,
  readConfigStatus,
  readSecurityStatus,
  readWebhooksStatus,
  type SecurityStatus,
  type WebhooksStatus,
} from '../api/ops-status-client.js'
import { listProviders, type ProviderSummary } from '../api/providers-client.js'
import { useAuth } from '../auth/auth-context.js'
import { Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

/** One label column for every card, so the values line up from one card to the next. */
const DL_CLASSES =
  'm-0 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[15rem_minmax(0,1fr)] ' +
  '[&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:break-words [&_dt]:font-medium'

/** The drivers' technical names, said the way the rest of the admin says them. */
const DRIVER_LABELS: Readonly<Record<string, string>> = {
  sqlite: 'SQLite',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  redis: 'Redis',
  s3: 'S3',
  pgvector: 'pgvector',
}

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
function driverLabel(driver: string, t: TFunction): string {
  if (driver === 'auto') return t('opsSettings.driverAuto')
  return DRIVER_LABELS[driver] ?? driver
}

/** Providers saved in the admin first (the agents use them), the configuration file's `llm` as the fallback. */
function describeLlm(
  config: ConfigStatus,
  providers: readonly ProviderSummary[],
  t: TFunction,
): string {
  const active = providers.filter((provider) => provider.enabled)
  if (active.length > 0) {
    return t('opsSettings.llmRegistered', {
      count: active.length,
      list: active.map((provider) => `${provider.provider} (${provider.model})`).join(', '),
    })
  }
  if (providers.length > 0) {
    return t('opsSettings.llmRegisteredDisabled', { count: providers.length })
  }
  if (config.llm !== undefined) return `${config.llm.provider} (${config.llm.model})`
  return t('opsSettings.llmNone')
}

export function OpsSettingsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [security, setSecurity] = useState<SecurityStatus | null>(null)
  const [webhooks, setWebhooks] = useState<WebhooksStatus | null>(null)
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token === null || !isAdmin) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      readSecurityStatus(token),
      readWebhooksStatus(token),
      readConfigStatus(token),
      // Agents run on the providers saved from the admin as well as on the
      // configuration file's `llm` section: this screen must count both.
      listProviders(token).catch((): readonly ProviderSummary[] => []),
    ])
      .then(([securityStatus, webhooksStatus, configStatus, savedProviders]) => {
        if (cancelled) return
        setSecurity(securityStatus)
        setWebhooks(webhooksStatus)
        setConfig(configStatus)
        setProviders(savedProviders)
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
        <h1
          id="ops-settings-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('opsSettings.heading')}
        </h1>
        <p className="text-muted-foreground max-w-3xl text-sm">{t('opsSettings.description')}</p>
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
            <dl className={DL_CLASSES}>
              <dt>{t('opsSettings.corsLabel')}</dt>
              <dd>
                {security.cors.enabled
                  ? t('opsSettings.corsEnabled', { origins: security.cors.origins.join(', ') })
                  : t('opsSettings.corsDisabled')}
              </dd>

              <dt>{t('opsSettings.cspLabel')}</dt>
              <dd className="font-mono break-all">
                {security.csp === null
                  ? t('opsSettings.cspDefault')
                  : security.csp === false
                    ? t('opsSettings.cspNone')
                    : security.csp}
              </dd>

              <dt>{t('opsSettings.hstsLabel')}</dt>
              <dd>
                {security.hsts.enabled
                  ? t('opsSettings.hstsEnabled', { maxAge: security.hsts.maxAge })
                  : t('opsSettings.hstsDisabled')}
              </dd>

              <dt>{t('opsSettings.pageCacheLabel')}</dt>
              <dd>
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

      {config !== null && (
        <Card aria-labelledby="ops-settings-config-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="ops-settings-config-heading">{t('opsSettings.configHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <dl className={DL_CLASSES}>
              <dt>{t('opsSettings.databaseLabel')}</dt>
              <dd>{driverLabel(config.database.driver, t)}</dd>

              <dt>{t('opsSettings.cacheLabel')}</dt>
              <dd>{driverLabel(config.cache.driver, t)}</dd>

              <dt>{t('opsSettings.queueLabel')}</dt>
              <dd>{driverLabel(config.queue.driver, t)}</dd>

              <dt>{t('opsSettings.storageLabel')}</dt>
              <dd>{driverLabel(config.storage.driver, t)}</dd>

              <dt>{t('opsSettings.llmLabel')}</dt>
              <dd>{describeLlm(config, providers, t)}</dd>

              <dt>{t('opsSettings.embeddingsLabel')}</dt>
              <dd>
                {config.embeddings.provider === 'local'
                  ? t('opsSettings.embeddingsLocal', { model: config.embeddings.model })
                  : `${config.embeddings.provider} (${config.embeddings.model})`}
              </dd>

              <dt>{t('opsSettings.imageGenerationLabel')}</dt>
              <dd>
                {providers.some((provider) => provider.enabled && provider.imageModel !== undefined)
                  ? providers
                      .filter((provider) => provider.enabled && provider.imageModel !== undefined)
                      .map((provider) => `${provider.provider} (${provider.imageModel})`)
                      .join(', ')
                  : config.imageGeneration === undefined
                    ? t('opsSettings.imageGenerationNone')
                    : `${config.imageGeneration.provider} (${config.imageGeneration.model})`}
              </dd>

              <dt>{t('opsSettings.vectorLabel')}</dt>
              <dd>{driverLabel(config.vector.driver, t)}</dd>

              <dt>{t('opsSettings.billingLabel')}</dt>
              <dd>
                {config.billingConfigured
                  ? t('opsSettings.billingConfigured')
                  : t('opsSettings.billingNotConfigured')}
              </dd>

              <dt>{t('opsSettings.notFoundPathLabel')}</dt>
              <dd className="font-mono">{config.site.notFoundPath}</dd>
            </dl>

            {/* Secret hygiene (fiche 23 task 5's second literal ask):
                "détecter et signaler" — never a hard refusal, since
                `database.url` is legitimately present in the file for the
                common SQLite/no-password case. */}
            <div>
              <h3 className="m-0 mb-2 font-sans text-sm font-semibold text-foreground">
                {t('opsSettings.secretHygieneHeading')}
              </h3>
              {config.secretHygiene.databaseUrlHasCredentialsInFile ? (
                <Notice tone="danger">
                  <p>{t('opsSettings.databaseUrlWarning')}</p>
                </Notice>
              ) : (
                <p className="m-0 text-sm text-muted-foreground">
                  {t('opsSettings.databaseUrlOk')}
                </p>
              )}
              {config.secretHygiene.envFilePath === null ? (
                <p className="m-0 mt-2 text-sm text-muted-foreground">
                  {t('opsSettings.envFileNone')}
                </p>
              ) : config.secretHygiene.envFileReadableByOthers === true ? (
                <div className="mt-2">
                  <Notice tone="danger">
                    <p>
                      {t('opsSettings.envFileWarning', { path: config.secretHygiene.envFilePath })}
                    </p>
                  </Notice>
                </div>
              ) : config.secretHygiene.envFileReadableByOthers === false ? (
                <p className="m-0 mt-2 text-sm text-muted-foreground">
                  {t('opsSettings.envFileOk')}
                </p>
              ) : (
                <p className="m-0 mt-2 text-sm text-muted-foreground">
                  {t('opsSettings.envFileUnknown')}
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </section>
  )
}
