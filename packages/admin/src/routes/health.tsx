import type { TFunction } from 'i18next'
import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type AuditIntegrityStatus,
  applyMigrations,
  type DiskUsageStatus,
  type DoctorCheck,
  type DoctorReport,
  type ErrorLogEntry,
  type MaintenanceState,
  type MigrationsApplyResult,
  type MigrationsStatus,
  readAuditIntegrity,
  readDiskUsage,
  readErrorLog,
  readHealthReport,
  readMaintenance,
  readMigrationsStatus,
  type SkippedDriverReason,
  setMaintenance,
} from '../api/health-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CopyButton,
  Field,
  Input,
  Notice,
} from '../ui/index.js'

/**
 * "Santé" — fiche 24 tasks 1, 2 and 4.
 *
 * The driver section is `runDoctor`'s own output, unchanged: the acceptance
 * criterion is that this screen is *the same code* as `cogenta doctor`, not a
 * second reading of the same drivers, and it holds because the server sends
 * back exactly what that function returned.
 */

/**
 * A driver in "basic mode" because no external service is configured is the
 * normal state of a fresh install, not a warning: it is shown as information.
 * Orange is kept for what deserves attention — a driver that was asked for and
 * failed (a fallback taken for a reason other than "not installed") — and red
 * for one that is down.
 */
function checkTone(check: DoctorCheck): 'success' | 'info' | 'warning' | 'danger' {
  if (check.status === 'down') return 'danger'
  const code = check.reasonCode
  const failedToStart =
    code?.code === 'fallback' && code.skipped.some((skip) => skip.reasonCode !== 'not-available')
  if (failedToStart) return 'warning'
  return check.status === 'ok' ? 'success' : 'info'
}

/** A plain-text copy of the diagnostic, for a support request. */
function reportAsText(report: DoctorReport, t: TFunction): string {
  const lines = report.checks.map(
    (check) =>
      `- ${t('health.driverLine', {
        need: t(`health.need.${check.need}`, { defaultValue: check.need }),
        driver: t(`health.driver.${check.driver}`, { defaultValue: check.driver }),
        tier: t(`health.tier.${check.tier}`, { defaultValue: check.tier }),
      })}`,
  )
  return [
    `Node ${report.node} · ${report.platform} ${report.arch}`,
    ...lines,
    ...report.notes.map((note) => `- ${note}`),
    ...report.problems.map((problem) => `! ${problem}`),
  ].join('\n')
}

/**
 * Fiche 35 audit T06 — `cogenta doctor`'s `notes`/`problems`/`check.message`
 * are free English text, built at the CLI's own diagnostic layer with no
 * i18n concept of its own (a real code-per-message restructuring is the
 * fiche's own "complete option", out of scope for this fix). Labelling each
 * one honestly as a technical detail, rather than letting it read as
 * incomplete or broken French, is the fiche's own recommended fast path.
 */
function TechnicalDetailBadge(): JSX.Element {
  const { t } = useTranslation()
  return (
    <span className="rounded border border-current px-1 text-[0.65rem] uppercase tracking-wide">
      {t('health.technicalDetail')}
    </span>
  )
}

/**
 * `check.reason` on its own is `@cogenta/core`'s driver registry composing
 * plain English sentences ("named in the configuration", "redis not
 * available") for `cogenta doctor`'s terminal output, which has never been
 * localized — showing that text verbatim in this French-language screen was
 * L20 audit §1 point 12. `check.reasonCode` carries the same information as
 * a stable code instead, translated here the way an `ErrorCode` is; `reason`
 * is kept only as the fallback for a server built before this field existed.
 */
function describeSkip(skip: SkippedDriverReason, t: TFunction): string {
  if (skip.reasonCode === 'not-available') {
    return t('health.skipNotAvailable', { driver: skip.driver })
  }
  if (skip.reasonCode === 'not-available-error') {
    return t('health.skipNotAvailableError', { driver: skip.driver, detail: skip.detail ?? '' })
  }
  return t('health.skipFailedToStart', { driver: skip.driver, detail: skip.detail ?? '' })
}

function describeReason(check: DoctorCheck, t: TFunction): string {
  const code = check.reasonCode
  if (code === undefined) return check.reason
  if (code.code === 'named') return t('health.reasonNamed')
  if (code.code === 'first-available') return t('health.reasonFirstAvailable')
  return t('health.reasonFallback', {
    skipped: code.skipped.map((skip) => describeSkip(skip, t)).join(', '),
  })
}

/** The notes in the admin's language: translated by code when the server sent codes, the raw English text (flagged as technical) otherwise. */
function noteLines(
  report: DoctorReport,
  t: TFunction,
): readonly { readonly text: string; readonly technical: boolean }[] {
  if (report.noteItems === undefined) {
    return report.notes.map((text) => ({ text, technical: true }))
  }
  return report.noteItems.map((item) => {
    const key = `health.noteCode.${item.code}`
    const translated = t(key, { ...item.params, defaultValue: '' })
    return translated === ''
      ? { text: item.text, technical: true }
      : { text: translated, technical: false }
  })
}

export function HealthRoute(): JSX.Element | null {
  const { t, i18n } = useTranslation()
  const formatWhen = useDateTimeFormatter()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [report, setReport] = useState<DoctorReport | null>(null)
  const [migrations, setMigrations] = useState<MigrationsStatus | null>(null)
  const [audit, setAudit] = useState<AuditIntegrityStatus | null>(null)
  const [disk, setDisk] = useState<DiskUsageStatus | null>(null)
  const [errors, setErrors] = useState<readonly ErrorLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<MigrationsApplyResult | null>(null)
  const [maintenance, setMaintenanceState] = useState<MaintenanceState | null>(null)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [togglingMaintenance, setTogglingMaintenance] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const [healthReport, migrationsStatus, auditStatus, diskStatus, errorLog, maintenanceState] =
        await Promise.all([
          readHealthReport(token),
          readMigrationsStatus(token),
          readAuditIntegrity(token),
          readDiskUsage(token),
          readErrorLog(token),
          readMaintenance(token),
        ])
      setReport(healthReport)
      setMigrations(migrationsStatus)
      setAudit(auditStatus)
      setDisk(diskStatus)
      setErrors(errorLog.entries)
      setMaintenanceState(maintenanceState)
      setMaintenanceMessage(maintenanceState.message ?? '')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('health.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  if (token === null) return null
  if (!isAdmin) {
    return (
      <section aria-labelledby="health-heading" className="flex flex-col gap-4">
        <h1 id="health-heading">{t('health.heading')}</h1>
        <p role="alert">{t('common.adminPageOnly')}</p>
      </section>
    )
  }

  const pendingCount = migrations?.items.filter((item) => !item.applied).length ?? 0
  const pendingDestructive =
    migrations?.items.filter((item) => !item.applied && item.destructive) ?? []

  async function onApply(): Promise<void> {
    if (token === null) return
    setApplying(true)
    setError(null)
    try {
      const result = await applyMigrations(token)
      setApplyResult(result)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('health.applyError'))
    } finally {
      setApplying(false)
    }
  }

  async function onToggleMaintenance(): Promise<void> {
    if (token === null || maintenance === null) return
    setTogglingMaintenance(true)
    setError(null)
    try {
      const next = await setMaintenance(token, {
        enabled: !maintenance.enabled,
        message: maintenanceMessage === '' ? null : maintenanceMessage,
      })
      setMaintenanceState(next)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('health.maintenanceError'))
    } finally {
      setTogglingMaintenance(false)
    }
  }

  return (
    <section
      aria-labelledby="health-heading"
      className="flex min-w-0 flex-col gap-6 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="health-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('health.heading')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {report !== null && (
            <CopyButton
              value={reportAsText(report, t)}
              label={t('health.copyReport')}
              copiedLabel={t('health.copiedReport')}
            />
          )}
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => void load()}>
            {t('health.recheck')}
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{t('health.loading')}</p>}
      {error !== null && (
        <Notice tone="danger" title={t('health.errorTitle')}>
          {error}
        </Notice>
      )}

      {report !== null && (
        <Card aria-labelledby="health-drivers-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="health-drivers-heading">{t('health.driversHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <p className="m-0 text-sm text-muted-foreground">
              {report.problems.length === 0
                ? t('health.driversIntroNone')
                : t('health.driversIntro', { count: report.problems.length })}
            </p>
            <ul className="m-0 flex flex-col gap-2 pl-0 list-none">
              {report.checks.map((check) => {
                const summaryKey = `health.driverSummary.${check.need}_${check.driver}`
                return (
                  <li key={check.need}>
                    <Notice tone={checkTone(check)} live="off">
                      <strong>
                        {t(`health.need.${check.need}`, { defaultValue: check.need })}
                      </strong>{' '}
                      — {t(`health.driver.${check.driver}`, { defaultValue: check.driver })} (
                      {t(`health.tier.${check.tier}`, { defaultValue: check.tier })}),{' '}
                      {describeReason(check, t)}
                      {i18n.exists(summaryKey) && (
                        <p className="m-0 mt-1 text-xs">{t(summaryKey)}</p>
                      )}
                      {check.message !== undefined && (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer">
                            <TechnicalDetailBadge />
                          </summary>
                          <p className="m-0 mt-1">{check.message}</p>
                        </details>
                      )}
                    </Notice>
                  </li>
                )
              })}
            </ul>
            {noteLines(report, t).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">{t('health.notesHeading')}</h3>
                <ul className="m-0 pl-5 text-sm text-muted-foreground">
                  {noteLines(report, t).map((line) => (
                    <li key={line.text}>
                      {line.technical && <TechnicalDetailBadge />} {line.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.problems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-destructive">
                  {t('health.problemsHeading')}
                </h3>
                <ul className="m-0 pl-5 text-sm text-destructive">
                  {report.problems.map((problem) => (
                    <li key={problem}>
                      <TechnicalDetailBadge /> {problem}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card aria-labelledby="health-migrations-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="health-migrations-heading">{t('health.migrationsHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {migrations !== null && (
            <>
              <p className="m-0 text-sm text-muted-foreground">
                {pendingCount === 0
                  ? t('health.migrationsAllApplied')
                  : t('health.migrationsPending', { count: pendingCount })}
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer">
                  {t('health.migrationsHistory', { total: migrations.items.length })}
                </summary>
                <ul className="m-0 mt-2 flex flex-col gap-1 pl-0 list-none">
                  {migrations.items.map((item) => (
                    <li key={item.id} className="text-sm">
                      {item.applied ? '✓' : '·'} {item.name}
                      {item.destructive && !item.applied && (
                        <span className="ml-2 text-xs text-destructive">
                          {t('health.destructive')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
              {pendingCount > 0 && (
                <div className="flex flex-col gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={applying}
                    onClick={() => void onApply()}
                  >
                    {applying ? t('health.applying') : t('health.applyButton')}
                  </Button>
                  {pendingDestructive.length > 0 && (
                    <Notice tone="warning" live="off">
                      {t('health.destructiveNotice', { count: pendingDestructive.length })}
                      <pre className="m-0 mt-2 whitespace-pre-wrap text-xs">
                        cogenta migrate up --confirm-destructive --backup-verified
                      </pre>
                    </Notice>
                  )}
                  {applyResult !== null && (
                    <Notice tone="success" live="off">
                      {t('health.applyResult', { count: applyResult.applied.length })}
                    </Notice>
                  )}
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card aria-labelledby="health-audit-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="health-audit-heading">{t('health.auditHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          {audit !== null && (
            <Notice tone={audit.ok ? 'success' : 'danger'} live="off">
              {audit.ok ? t('health.auditOk') : (audit.error ?? t('health.auditFailed'))}
            </Notice>
          )}
          {disk !== null &&
            disk.available &&
            disk.freeBytes !== undefined &&
            disk.totalBytes !== undefined && (
              <p className="m-0 text-sm text-muted-foreground">
                {t('health.diskUsage', {
                  free: Math.round(disk.freeBytes / 1_000_000_000),
                  total: Math.round(disk.totalBytes / 1_000_000_000),
                })}
              </p>
            )}
        </CardBody>
      </Card>

      <Card aria-labelledby="health-errors-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="health-errors-heading">{t('health.errorLogHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {errors !== null && errors.length === 0 && (
            <p className="m-0 text-sm text-muted-foreground">{t('health.errorLogEmpty')}</p>
          )}
          {errors !== null && errors.length > 0 && (
            <ul className="m-0 flex flex-col gap-2 pl-0 list-none">
              {errors.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <span className="text-xs text-muted-foreground">{formatWhen(entry.at)}</span>{' '}
                  <strong>{entry.code}</strong>: {entry.message}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card aria-labelledby="health-maintenance-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="health-maintenance-heading">{t('health.maintenanceHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="m-0 text-sm text-muted-foreground">{t('health.maintenanceIntro')}</p>
          {maintenance !== null && (
            <>
              <Notice tone={maintenance.enabled ? 'warning' : 'info'} live="off">
                {maintenance.enabled ? t('health.maintenanceOn') : t('health.maintenanceOff')}
              </Notice>
              <Field label={t('health.maintenanceMessageLabel')}>
                {(control) => (
                  <Input
                    {...control}
                    value={maintenanceMessage}
                    onChange={(event) => setMaintenanceMessage(event.target.value)}
                    placeholder={t('health.maintenanceMessagePlaceholder')}
                  />
                )}
              </Field>
              <div>
                <Button
                  variant={maintenance.enabled ? 'secondary' : 'destructive'}
                  size="sm"
                  disabled={togglingMaintenance}
                  onClick={() => void onToggleMaintenance()}
                >
                  {maintenance.enabled
                    ? t('health.maintenanceTurnOff')
                    : t('health.maintenanceTurnOn')}
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </section>
  )
}
