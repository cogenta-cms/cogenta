import { Fragment, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
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
import { Button, Card, CardBody, Modal, Notice } from '../ui/index.js'

/**
 * "Mises à jour" (L22 task 9) — its own screen (fiche 66). This card used to
 * live folded into `ops-settings.tsx`, whose title reads "Sécurité &
 * webhooks" — nothing about updates. `updates-client.ts` was already
 * self-contained; this is a pure move of the screen around it, same
 * behaviour, same client, same requests.
 */
export function UpdatesRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

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
      setUpdatesError(caught instanceof ApiError ? caught.message : t('updates.loadError'))
    } finally {
      setUpdatesLoading(false)
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
        setApplyMessage(t('updates.upToDate'))
        setRisky(null)
      } else if (result.kind === 'confirmation-required') {
        setRisky(result.risky)
      } else {
        setRisky(null)
        setApplyMessage(
          t('updates.applied', {
            packages: result.installed.map((pkg) => `${pkg.name}@${pkg.version}`).join(', '),
          }),
        )
      }
      await loadUpdates()
    } catch (caught) {
      setUpdatesError(caught instanceof ApiError ? caught.message : t('updates.applyError'))
    } finally {
      setApplying(false)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="updates-heading">
        <h1 id="updates-heading">{t('updates.heading')}</h1>
        <p role="alert">{t('updates.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="updates-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="updates-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('updates.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('updates.description')}</p>
      </div>

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
        <Card>
          <CardBody className="flex flex-col gap-4">
            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              {updateStatus.packages.map((pkg) => (
                <Fragment key={pkg.name}>
                  <dt className="font-mono font-medium">{pkg.name}</dt>
                  <dd className="m-0">
                    {pkg.checkError !== undefined
                      ? t('updates.checkError', { error: pkg.checkError })
                      : pkg.updateAvailable
                        ? t('updates.available', {
                            installed: pkg.installed,
                            latest: pkg.latest,
                            bump: pkg.bump,
                          })
                        : t('updates.upToDateOne', { installed: pkg.installed })}
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
                {t('updates.checkNow')}
              </Button>
              <Button
                onClick={() => void runApply(false)}
                disabled={applying || !updateStatus.updateAvailable}
              >
                {applying ? t('updates.applying') : t('updates.applyNow')}
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
                <h2 className="m-0 mb-2 font-sans text-sm font-semibold text-foreground">
                  {t('updates.historyHeading')}
                </h2>
                {updateHistory.entries.length === 0 && updateHistory.restorePoints.length === 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">{t('updates.historyEmpty')}</p>
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
                        {point.triggeredByUpdate ? ` (${t('updates.autoRestorePoint')})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Modal
        open={risky !== null}
        onOpenChange={(open) => {
          if (!open) setRisky(null)
        }}
        title={t('updates.riskHeading')}
        description={t('updates.riskDescription')}
        closeLabel={t('updates.riskClose')}
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
              {t('updates.riskConfirm')}
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
    </section>
  )
}
