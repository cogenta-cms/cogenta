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
import { useLocalPagination } from '../lib/use-local-pagination.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Notice,
  Pagination,
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
 * Both tables page **client-side** over the snapshot `readObservability`
 * already returns whole — fiche 67 task 4. Unlike the audit log, this data
 * is not a growing table with a server-side cursor to walk: it is
 * `@cogenta/observability`'s in-memory ring buffer, hard-capped at 500
 * traces and 500 logs (`recent-store.ts`'s `DEFAULT_TRACE_CAPACITY`/
 * `DEFAULT_LOG_CAPACITY`) and gone on the next restart. A second round trip
 * per page would buy nothing a client-side slice does not already have.
 */
const PAGE_SIZE = 20

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
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [snapshot, setSnapshot] = useState<ObservabilitySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshotVersion, setSnapshotVersion] = useState(0)
  const traces = useLocalPagination(snapshot?.traces ?? [], String(snapshotVersion), PAGE_SIZE)
  const logs = useLocalPagination(snapshot?.logs ?? [], String(snapshotVersion), PAGE_SIZE)
  const tracesPager = (
    <Pagination
      variant="pages"
      page={traces.page}
      pageCount={traces.pageCount}
      onPageChange={traces.onPageChange}
      previousLabel={t('lists.previous')}
      nextLabel={t('lists.next')}
      pageInfo={t('lists.pageInfo', {
        from: traces.start + 1,
        to: traces.start + traces.items.length,
        total: traces.total,
      })}
    />
  )
  const logsPager = (
    <Pagination
      variant="pages"
      page={logs.page}
      pageCount={logs.pageCount}
      onPageChange={logs.onPageChange}
      previousLabel={t('lists.previous')}
      nextLabel={t('lists.next')}
      pageInfo={t('lists.pageInfo', {
        from: logs.start + 1,
        to: logs.start + logs.items.length,
        total: logs.total,
      })}
    />
  )

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    try {
      const [allSettings, observability] = await Promise.all([
        listSettings(undefined, token ?? undefined),
        readObservability(token),
      ])
      setSettings(allSettings.filter((setting) => setting.group === 'observability'))
      setSnapshot(observability)
      setError(null)
      // A fresh snapshot can be shorter than before (the ring buffer keeps
      // growing while this screen sits open) — landing on a page number that
      // no longer exists would just show an empty table, so every reload
      // starts back at the newest entries.
      setSnapshotVersion((version) => version + 1)
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

  // This built its own formatter and passed no time zone, so it read correctly
  // only while the browser happened to sit in the site's own — which is how a
  // screen can look right and still ignore the setting that governs it.
  const formatDateTime = useDateTimeFormatter()

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
        <h1
          id="observability-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
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
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="observability-traces-heading">{t('observability.tracesHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {tracesPager}
            <TracesTable
              traces={traces.items}
              formatDateTime={formatDateTime}
              emptyLabel={t('observability.tracesEmpty')}
              t={t}
            />
            {tracesPager}
          </CardBody>
        </Card>
      )}

      {snapshot !== null && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="observability-logs-heading">{t('observability.logsHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {logsPager}
            <LogsTable
              logs={logs.items}
              formatDateTime={formatDateTime}
              emptyLabel={t('observability.logsEmpty')}
              t={t}
            />
            {logsPager}
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
      <Table className="min-w-[36rem]">
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
      <Table className="min-w-[36rem]">
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
