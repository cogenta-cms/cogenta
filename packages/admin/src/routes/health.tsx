import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type AuditIntegrityStatus,
  applyMigrations,
  type DiskUsageStatus,
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
  setMaintenance,
} from '../api/health-client.js'
import { useAuth } from '../auth/auth-context.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

/**
 * "Santé" — fiche 24 tasks 1, 2 and 4.
 *
 * The driver section is `runDoctor`'s own output, unchanged: the acceptance
 * criterion is that this screen is *the same code* as `cogenta doctor`, not a
 * second reading of the same drivers, and it holds because the server sends
 * back exactly what that function returned.
 */

function statusTone(status: 'ok' | 'degraded' | 'down'): 'success' | 'warning' | 'danger' {
  if (status === 'ok') return 'success'
  if (status === 'degraded') return 'warning'
  return 'danger'
}

export function HealthRoute(): JSX.Element | null {
  const { t } = useTranslation()
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

  if (token === null || !isAdmin) return null

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
    <section aria-labelledby="health-heading" className="flex flex-col gap-6">
      <h1 id="health-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('health.heading')}
      </h1>

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
              {t('health.driversIntro', { count: report.problems.length })}
            </p>
            <ul className="m-0 flex flex-col gap-2 pl-0 list-none">
              {report.checks.map((check) => (
                <li key={check.need}>
                  <Notice tone={statusTone(check.status)} live="off">
                    <strong>{check.need}</strong>: {check.driver} ({check.tier}) — {check.reason}
                    {check.message !== undefined && (
                      <p className="m-0 mt-1 text-xs">{check.message}</p>
                    )}
                  </Notice>
                </li>
              ))}
            </ul>
            {report.notes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">{t('health.notesHeading')}</h3>
                <ul className="m-0 pl-5 text-sm text-muted-foreground">
                  {report.notes.map((note) => (
                    <li key={note}>{note}</li>
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
                    <li key={problem}>{problem}</li>
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
                {t('health.migrationsSummary', {
                  total: migrations.items.length,
                  pending: pendingCount,
                })}
              </p>
              <ul className="m-0 flex flex-col gap-1 pl-0 list-none">
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
                  <span className="font-mono text-xs text-muted-foreground">{entry.at}</span>{' '}
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
              <label className="flex flex-col gap-1 text-xs">
                {t('health.maintenanceMessageLabel')}
                <input
                  type="text"
                  value={maintenanceMessage}
                  onChange={(event) => setMaintenanceMessage(event.target.value)}
                  className="rounded border border-input bg-background px-2 py-1 text-sm"
                  placeholder={t('health.maintenanceMessagePlaceholder')}
                />
              </label>
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
