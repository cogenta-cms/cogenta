import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type ObservabilityLog,
  type ObservabilitySnapshot,
  type ObservabilityTrace,
  readObservability,
} from '../api/observability-client.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * "Exploitation" > Observabilité (fiche L22 task 5). Point 3's own wording —
 * "honnête sur ce qu'elle montre (pas un remplacement d'un vrai APM, une vue
 * locale de secours)" — is why `observability.intro` says exactly that, and
 * why this screen never claims retention beyond the process's own recent-
 * events buffer.
 *
 * The two site settings (`observability.enabled`/`observability.logLevel`)
 * go through the same generic registry every other editorial setting does
 * (`SiteSettingsField`, `settings-client.ts`) — same shape
 * `CommerceSettingsRoute` already uses for a group with its own screen
 * instead of a `SettingsRoute` tab. The traces/logs themselves come from a
 * dedicated read-only endpoint (`observability-client.ts`) because they are
 * not settings — nothing here is written back through `PATCH /api/settings`.
 */
export function ObservabilityRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [snapshot, setSnapshot] = useState<ObservabilitySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    try {
      const [allSettings, observability] = await Promise.all([
        listSettings(),
        readObservability(token),
      ])
      setSettings(allSettings.filter((setting) => setting.group === 'observability'))
      setSnapshot(observability)
      setError(null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('observability.loadError'))
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function save(key: string, value: unknown): Promise<void> {
    if (token === null) return
    await writeSetting(token, key, value)
    await load()
  }

  function formatDateTime(iso: string): string {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return iso
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(parsed)
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="observability-heading">
        <h1 id="observability-heading">{t('observability.heading')}</h1>
        <p role="alert">{t('observability.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="observability-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="observability-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('observability.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('observability.intro')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      {settings !== null && (
        <Card aria-labelledby="observability-settings-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="observability-settings-heading">{t('observability.settingsHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            {settings.map((setting) => (
              <SiteSettingsField
                key={setting.key}
                setting={setting}
                canEdit
                onSave={(value) => save(setting.key, value)}
              />
            ))}
          </CardBody>
        </Card>
      )}

      {snapshot !== null && !snapshot.enabled && (
        <Notice tone="info" live="off">
          <p>{t('observability.disabledNotice')}</p>
        </Notice>
      )}

      {snapshot !== null && (
        <Card aria-labelledby="observability-traces-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="observability-traces-heading">{t('observability.tracesHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <TracesTable
              traces={snapshot.traces}
              formatDateTime={formatDateTime}
              emptyLabel={t('observability.tracesEmpty')}
              t={t}
            />
          </CardBody>
        </Card>
      )}

      {snapshot !== null && (
        <Card aria-labelledby="observability-logs-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="observability-logs-heading">{t('observability.logsHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <LogsTable
              logs={snapshot.logs}
              formatDateTime={formatDateTime}
              emptyLabel={t('observability.logsEmpty')}
              t={t}
            />
          </CardBody>
        </Card>
      )}
    </section>
  )
}

function TracesTable({
  traces,
  formatDateTime,
  emptyLabel,
  t,
}: {
  readonly traces: readonly ObservabilityTrace[]
  formatDateTime(iso: string): string
  readonly emptyLabel: string
  t(key: string): string
}): JSX.Element {
  return (
    <TableRoot label={t('observability.tracesHeading')}>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t('observability.tracesTime')}</TableHeader>
            <TableHeader>{t('observability.tracesMethod')}</TableHeader>
            <TableHeader>{t('observability.tracesPath')}</TableHeader>
            <TableHeader>{t('observability.tracesStatus')}</TableHeader>
            <TableHeader>{t('observability.tracesDuration')}</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {traces.map((trace) => (
            <TableRow key={trace.id}>
              <TableCell>
                <span title={trace.at} className="font-mono text-xs">
                  {formatDateTime(trace.at)}
                </span>
              </TableCell>
              <TableCell>{trace.method ?? '—'}</TableCell>
              <TableCell>{trace.path ?? '—'}</TableCell>
              <TableCell>
                <span className={trace.ok ? '' : 'text-destructive font-medium'}>
                  {trace.statusCode ?? '—'}
                </span>
              </TableCell>
              <TableCell>{Math.round(trace.durationMs)} ms</TableCell>
            </TableRow>
          ))}
          {traces.length === 0 && <TableEmpty colSpan={5}>{emptyLabel}</TableEmpty>}
        </TableBody>
      </Table>
    </TableRoot>
  )
}

function LogsTable({
  logs,
  formatDateTime,
  emptyLabel,
  t,
}: {
  readonly logs: readonly ObservabilityLog[]
  formatDateTime(iso: string): string
  readonly emptyLabel: string
  t(key: string): string
}): JSX.Element {
  return (
    <TableRoot label={t('observability.logsHeading')}>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t('observability.logsTime')}</TableHeader>
            <TableHeader>{t('observability.logsLevel')}</TableHeader>
            <TableHeader>{t('observability.logsMessage')}</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>
                <span title={log.at} className="font-mono text-xs">
                  {formatDateTime(log.at)}
                </span>
              </TableCell>
              <TableCell>
                <span className={log.level === 'error' ? 'text-destructive font-medium' : ''}>
                  {log.level}
                </span>
              </TableCell>
              <TableCell>{log.msg}</TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && <TableEmpty colSpan={3}>{emptyLabel}</TableEmpty>}
        </TableBody>
      </Table>
    </TableRoot>
  )
}
