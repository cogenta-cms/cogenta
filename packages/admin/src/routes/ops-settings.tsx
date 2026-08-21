import { Fragment, type JSX, useCallback, useEffect, useState } from 'react'
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
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import {
  applyUpdateNow,
  readUpdateHistory,
  readUpdateStatus,
  type UpdateApplyResult,
  type UpdateCheckReport,
  type UpdateHistory,
  type UpdatePackageStatus,
} from '../api/updates-client.js'
import { useAuth } from '../auth/auth-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Modal, Notice } from '../ui/index.js'

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
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Update system (L22 task 9) — its own independent loading state: npm can
  // be slow or unreachable, and that must never blank out the security/
  // webhooks/config cards above, which need no network at all.
  const [updateStatus, setUpdateStatus] = useState<UpdateCheckReport | null>(null)
  const [updateHistory, setUpdateHistory] = useState<UpdateHistory | null>(null)
  const [autoUpdateSetting, setAutoUpdateSetting] = useState<SiteSetting | null>(null)
  const [updatesLoading, setUpdatesLoading] = useState(true)
  const [updatesError, setUpdatesError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyMessage, setApplyMessage] = useState<string | null>(null)
  const [risky, setRisky] = useState<readonly UpdatePackageStatus[] | null>(null)

  const loadUpdates = useCallback(async () => {
    if (token === null || !isAdmin) return
    setUpdatesLoading(true)
    setUpdatesError(null)
    try {
      const [status, history, settings] = await Promise.all([
        readUpdateStatus(token),
        readUpdateHistory(token),
        listSettings(),
      ])
      setUpdateStatus(status)
      setUpdateHistory(history)
      setAutoUpdateSetting(
        settings.find((setting) => setting.key === 'updates.autoUpdatePolicy') ?? null,
      )
    } catch (caught) {
      setUpdatesError(
        caught instanceof ApiError ? caught.message : t('opsSettings.updatesLoadError'),
      )
    } finally {
      setUpdatesLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    if (token === null || !isAdmin) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([readSecurityStatus(token), readWebhooksStatus(token), readConfigStatus(token)])
      .then(([securityStatus, webhooksStatus, configStatus]) => {
        if (cancelled) return
        setSecurity(securityStatus)
        setWebhooks(webhooksStatus)
        setConfig(configStatus)
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

  useEffect(() => {
    void loadUpdates()
  }, [loadUpdates])

  async function saveAutoUpdatePolicy(value: unknown): Promise<void> {
    if (token === null) return
    await writeSetting(token, 'updates.autoUpdatePolicy', value)
    await loadUpdates()
  }

  async function runApply(confirmBreakingChange: boolean): Promise<void> {
    if (token === null) return
    setApplying(true)
    setApplyMessage(null)
    setUpdatesError(null)
    try {
      const result: UpdateApplyResult = await applyUpdateNow(token, confirmBreakingChange)
      if (result.kind === 'up-to-date') {
        setApplyMessage(t('opsSettings.updatesUpToDate'))
        setRisky(null)
      } else if (result.kind === 'confirmation-required') {
        setRisky(result.risky)
      } else {
        setRisky(null)
        setApplyMessage(
          t('opsSettings.updatesApplied', {
            packages: result.installed.map((pkg) => `${pkg.name}@${pkg.version}`).join(', '),
          }),
        )
      }
      await loadUpdates()
    } catch (caught) {
      setUpdatesError(
        caught instanceof ApiError ? caught.message : t('opsSettings.updatesApplyError'),
      )
    } finally {
      setApplying(false)
    }
  }

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

      <Card aria-labelledby="ops-settings-updates-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="ops-settings-updates-heading">{t('opsSettings.updatesHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {updatesError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{updatesError}</p>
            </Notice>
          )}
          {applyMessage !== null && (
            <Notice tone="success" live="polite">
              <p>{applyMessage}</p>
            </Notice>
          )}
          {updatesLoading && updateStatus === null && <p>{t('common.loading')}</p>}

          {updateStatus !== null && (
            <>
              <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                {updateStatus.packages.map((pkg) => (
                  <Fragment key={pkg.name}>
                    <dt className="font-mono font-medium">{pkg.name}</dt>
                    <dd className="m-0">
                      {pkg.checkError !== undefined
                        ? t('opsSettings.updatesCheckError', { error: pkg.checkError })
                        : pkg.updateAvailable
                          ? t('opsSettings.updatesAvailable', {
                              installed: pkg.installed,
                              latest: pkg.latest,
                              bump: pkg.bump,
                            })
                          : t('opsSettings.updatesUpToDateOne', { installed: pkg.installed })}
                    </dd>
                  </Fragment>
                ))}
              </dl>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void loadUpdates()}
                  disabled={updatesLoading}
                >
                  {t('opsSettings.updatesCheckNow')}
                </Button>
                <Button
                  onClick={() => void runApply(false)}
                  disabled={applying || !updateStatus.updateAvailable}
                >
                  {applying ? t('opsSettings.updatesApplying') : t('opsSettings.updatesApplyNow')}
                </Button>
              </div>

              {autoUpdateSetting !== null && (
                <div className="max-w-sm">
                  <SiteSettingsField
                    setting={autoUpdateSetting}
                    canEdit
                    onSave={saveAutoUpdatePolicy}
                  />
                </div>
              )}

              {updateHistory !== null && (
                <div>
                  <h3 className="m-0 mb-2 font-sans text-sm font-semibold text-foreground">
                    {t('opsSettings.updatesHistoryHeading')}
                  </h3>
                  {updateHistory.entries.length === 0 &&
                  updateHistory.restorePoints.length === 0 ? (
                    <p className="m-0 text-sm text-muted-foreground">
                      {t('opsSettings.updatesHistoryEmpty')}
                    </p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                      {updateHistory.entries.map((entry) => (
                        <li key={entry.id} className="font-mono">
                          {entry.at} — {entry.action}
                        </li>
                      ))}
                      {updateHistory.restorePoints.map((point) => (
                        <li key={point.path} className="font-mono text-muted-foreground">
                          {point.createdAt} — {point.path}
                          {point.triggeredByUpdate
                            ? ` (${t('opsSettings.updatesAutoRestorePoint')})`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Modal
        open={risky !== null}
        onOpenChange={(open) => {
          if (!open) setRisky(null)
        }}
        title={t('opsSettings.updatesRiskHeading')}
        description={t('opsSettings.updatesRiskDescription')}
        closeLabel={t('opsSettings.updatesRiskClose')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRisky(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setRisky(null)
                void runApply(true)
              }}
              disabled={applying}
            >
              {t('opsSettings.updatesRiskConfirm')}
            </Button>
          </>
        }
      >
        <ul className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
          {(risky ?? []).map((pkg) => (
            <li key={pkg.name}>
              <p className="m-0 font-medium">
                {pkg.name}: {pkg.installed} → {pkg.latest}
              </p>
              <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-muted-foreground">
                {(pkg.contractRisk?.warnings ?? []).map((warning) => (
                  <li key={warning.version}>
                    {warning.version}: {warning.excerpt}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Modal>

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

      {config !== null && (
        <Card aria-labelledby="ops-settings-config-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="ops-settings-config-heading">{t('opsSettings.configHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-medium">{t('opsSettings.databaseLabel')}</dt>
              <dd className="m-0">{config.database.driver}</dd>

              <dt className="font-medium">{t('opsSettings.cacheLabel')}</dt>
              <dd className="m-0">{config.cache.driver}</dd>

              <dt className="font-medium">{t('opsSettings.queueLabel')}</dt>
              <dd className="m-0">{config.queue.driver}</dd>

              <dt className="font-medium">{t('opsSettings.storageLabel')}</dt>
              <dd className="m-0">{config.storage.driver}</dd>

              <dt className="font-medium">{t('opsSettings.llmLabel')}</dt>
              <dd className="m-0">
                {config.llm === undefined
                  ? t('opsSettings.llmNone')
                  : `${config.llm.provider} (${config.llm.model})`}
              </dd>

              <dt className="font-medium">{t('opsSettings.embeddingsLabel')}</dt>
              <dd className="m-0">
                {config.embeddings.provider} ({config.embeddings.model})
              </dd>

              <dt className="font-medium">{t('opsSettings.imageGenerationLabel')}</dt>
              <dd className="m-0">
                {config.imageGeneration === undefined
                  ? t('opsSettings.imageGenerationNone')
                  : `${config.imageGeneration.provider} (${config.imageGeneration.model})`}
              </dd>

              <dt className="font-medium">{t('opsSettings.vectorLabel')}</dt>
              <dd className="m-0">{config.vector.driver}</dd>

              <dt className="font-medium">{t('opsSettings.billingLabel')}</dt>
              <dd className="m-0">
                {config.billingConfigured
                  ? t('opsSettings.billingConfigured')
                  : t('opsSettings.billingNotConfigured')}
              </dd>

              <dt className="font-medium">{t('opsSettings.notFoundPathLabel')}</dt>
              <dd className="m-0 font-mono">{config.site.notFoundPath}</dd>
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

      <p className="text-muted-foreground text-sm">{t('opsSettings.readOnlyNote')}</p>
    </section>
  )
}
