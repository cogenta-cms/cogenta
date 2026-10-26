import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
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
import { formatDateTime } from '../lib/format.js'
import { describeLog } from '../lib/observability-log.js'
import { useLocalPagination } from '../lib/use-local-pagination.js'
import { useDateTimeFormatter, useFormattingSettings } from '../settings/site-settings-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Modal,
  Notice,
  Pagination,
  Select,
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
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [snapshot, setSnapshot] = useState<ObservabilitySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshotVersion, setSnapshotVersion] = useState(0)
  const [pathFilter, setPathFilter] = useState('')
  const [failuresOnly, setFailuresOnly] = useState(false)
  const [levelFilter, setLevelFilter] = useState('all')
  const [detail, setDetail] = useState<
    | { readonly kind: 'trace'; readonly trace: ObservabilityTrace }
    | { readonly kind: 'log'; readonly log: ObservabilityLog }
    | null
  >(null)

  const filteredTraces = useMemo(
    () =>
      (snapshot?.traces ?? []).filter(
        (trace) =>
          (!failuresOnly || !trace.ok) &&
          (pathFilter.trim() === '' ||
            `${trace.method ?? ''} ${trace.path ?? trace.name}`
              .toLowerCase()
              .includes(pathFilter.trim().toLowerCase())),
      ),
    [snapshot, failuresOnly, pathFilter],
  )
  const filteredLogs = useMemo(
    () =>
      (snapshot?.logs ?? []).filter((log) => levelFilter === 'all' || log.level === levelFilter),
    [snapshot, levelFilter],
  )
  const filterKey = `${snapshotVersion}|${pathFilter}|${failuresOnly}|${levelFilter}`
  const traces = useLocalPagination(filteredTraces, filterKey, PAGE_SIZE)
  const logs = useLocalPagination(filteredLogs, filterKey, PAGE_SIZE)
  const tracesPager = (
    <Pagination
      variant="pages"
      page={traces.page}
      pageCount={traces.pageCount}
      onPageChange={traces.onPageChange}
      previousLabel={t('lists.previous')}
      nextLabel={t('lists.next')}
      pageInfo={t('lists.pageInfo', {
        from: traces.total === 0 ? 0 : traces.start + 1,
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
        from: logs.total === 0 ? 0 : logs.start + 1,
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

  // The site's own time zone, to the second: a request trace is read against
  // another one a moment apart, which "14:18" for every row cannot do.
  const { timeZone } = useFormattingSettings()
  const formatMoment = useCallback(
    (iso: string): string =>
      formatDateTime(iso, {
        locale: i18n.language,
        timeZone,
        dateStyle: 'short',
        timeStyle: 'medium',
      }),
    [i18n.language, timeZone],
  )
  // Kept for the details dialog, which names the day in full.
  const formatLong = useDateTimeFormatter()

  if (!isAdmin) {
    return (
      <section aria-labelledby="observability-heading">
        <h1 id="observability-heading">{t('observability.heading')}</h1>
        <p role="alert">{t('observability.adminOnly')}</p>
      </section>
    )
  }

  const collectionSettings = (settings ?? []).filter(
    (setting) => setting.key !== 'observability.otlpEndpoint',
  )
  const exportSetting = (settings ?? []).find(
    (setting) => setting.key === 'observability.otlpEndpoint',
  )
  const exportInfo = snapshot?.export

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
            {collectionSettings.map((setting) => (
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

      {exportSetting !== undefined && (
        <Card aria-labelledby="observability-export-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="observability-export-heading">{t('observability.exportHeading')}</h2>
            </CardTitle>
            <CardDescription>{t('observability.exportIntro')}</CardDescription>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <SiteSettingsField
              setting={exportSetting}
              canEdit
              onSave={(value) => save(exportSetting.key, value)}
            />
            <p className="m-0 text-sm" role="status">
              {exportInfo?.endpoint == null
                ? t('observability.exportInactive')
                : t(
                    exportInfo.source === 'config'
                      ? 'observability.exportActiveConfig'
                      : 'observability.exportActiveSetting',
                    { endpoint: exportInfo.endpoint },
                  )}
            </p>
            <p className="m-0 text-xs text-muted-foreground">{t('observability.exportHelp')}</p>
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
            <div className="flex flex-wrap items-end gap-4">
              <Field label={t('observability.tracesSearch')} className="w-full max-w-xs">
                {(control) => (
                  <Input
                    {...control}
                    type="search"
                    value={pathFilter}
                    placeholder={t('observability.tracesSearchPlaceholder')}
                    onChange={(event) => setPathFilter(event.target.value)}
                  />
                )}
              </Field>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={failuresOnly}
                  onChange={(event) => setFailuresOnly(event.target.checked)}
                />
                {t('observability.tracesFailuresOnly')}
              </label>
            </div>
            {tracesPager}
            <TracesTable
              traces={traces.items}
              formatMoment={formatMoment}
              emptyLabel={t('observability.tracesEmpty')}
              onOpen={(trace) => setDetail({ kind: 'trace', trace })}
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
            <Field label={t('observability.logsLevelFilter')} className="w-full max-w-xs">
              {(control) => (
                <Select
                  {...control}
                  value={levelFilter}
                  onChange={(event) => setLevelFilter(event.target.value)}
                >
                  <option value="all">{t('observability.logsAllLevels')}</option>
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {t(`observability.level.${level}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {logsPager}
            <LogsTable
              logs={logs.items}
              formatMoment={formatMoment}
              emptyLabel={t('observability.logsEmpty')}
              onOpen={(log) => setDetail({ kind: 'log', log })}
            />
            {logsPager}
          </CardBody>
        </Card>
      )}

      {detail !== null && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) setDetail(null)
          }}
          title={t(
            detail.kind === 'trace' ? 'observability.traceDetail' : 'observability.logDetail',
          )}
          closeLabel={t('common.close')}
          footer={
            <Button variant="ghost" onClick={() => setDetail(null)}>
              {t('common.close')}
            </Button>
          }
        >
          {detail.kind === 'trace' ? (
            <DetailList
              rows={[
                [t('observability.tracesTime'), formatLong(detail.trace.at)],
                [t('observability.tracesMethod'), detail.trace.method ?? '—'],
                [t('observability.tracesPath'), detail.trace.path ?? detail.trace.name],
                [t('observability.tracesStatus'), String(detail.trace.statusCode ?? '—')],
                [t('observability.tracesDuration'), `${Math.round(detail.trace.durationMs)} ms`],
                [t('observability.traceId'), detail.trace.traceId],
                [t('observability.spanId'), detail.trace.spanId],
              ]}
            />
          ) : (
            <DetailList
              rows={[
                [t('observability.logsTime'), formatLong(detail.log.at)],
                [t('observability.logsLevel'), t(`observability.level.${detail.log.level}`)],
                [t('observability.logsMessage'), describeLog(detail.log, t).text],
                ...describeLog(detail.log, t).details.map(([key, value]) => [key, value] as const),
              ]}
            />
          )}
        </Modal>
      )}
    </section>
  )
}

const LEVELS = ['error', 'warn', 'info', 'debug'] as const

function DetailList({
  rows,
}: {
  readonly rows: readonly (readonly [string, string])[]
}): JSX.Element {
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_minmax(0,1fr)] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:break-words">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-medium text-muted-foreground">{label}</dt>
          <dd className="font-mono text-xs leading-5">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function TracesTable({
  traces,
  formatMoment,
  emptyLabel,
  onOpen,
}: {
  readonly traces: readonly ObservabilityTrace[]
  formatMoment(iso: string): string
  readonly emptyLabel: string
  onOpen(trace: ObservabilityTrace): void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <TableRoot label={t('observability.tracesHeading')} stacked>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t('observability.tracesTime')}</TableHeader>
            <TableHeader>{t('observability.tracesMethod')}</TableHeader>
            <TableHeader>{t('observability.tracesPath')}</TableHeader>
            <TableHeader>{t('observability.tracesStatus')}</TableHeader>
            <TableHeader>{t('observability.tracesDuration')}</TableHeader>
            <TableHeader>
              <span className="sr-only">{t('observability.details')}</span>
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {traces.map((trace) => (
            <TableRow key={trace.id}>
              <TableCell label={t('observability.tracesTime')}>
                <span title={trace.at} className="font-mono text-xs">
                  {formatMoment(trace.at)}
                </span>
              </TableCell>
              <TableCell label={t('observability.tracesMethod')}>{trace.method ?? '—'}</TableCell>
              <TableCell label={t('observability.tracesPath')} className="break-all">
                {trace.path ?? trace.name}
              </TableCell>
              <TableCell label={t('observability.tracesStatus')}>
                <Badge tone={trace.ok ? 'success' : 'danger'}>{trace.statusCode ?? '—'}</Badge>
              </TableCell>
              <TableCell label={t('observability.tracesDuration')}>
                {Math.round(trace.durationMs)} ms
              </TableCell>
              <TableCell stack="actions" className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onOpen(trace)}>
                  {t('observability.details')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {traces.length === 0 && <TableEmpty colSpan={6}>{emptyLabel}</TableEmpty>}
        </TableBody>
      </Table>
    </TableRoot>
  )
}

function LogsTable({
  logs,
  formatMoment,
  emptyLabel,
  onOpen,
}: {
  readonly logs: readonly ObservabilityLog[]
  formatMoment(iso: string): string
  readonly emptyLabel: string
  onOpen(log: ObservabilityLog): void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <TableRoot label={t('observability.logsHeading')} stacked>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t('observability.logsTime')}</TableHeader>
            <TableHeader>{t('observability.logsLevel')}</TableHeader>
            <TableHeader>{t('observability.logsMessage')}</TableHeader>
            <TableHeader>
              <span className="sr-only">{t('observability.details')}</span>
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell label={t('observability.logsTime')}>
                <span title={log.at} className="font-mono text-xs">
                  {formatMoment(log.at)}
                </span>
              </TableCell>
              <TableCell label={t('observability.logsLevel')}>
                <Badge
                  tone={
                    log.level === 'error'
                      ? 'danger'
                      : log.level === 'warn'
                        ? 'warning'
                        : log.level === 'info'
                          ? 'info'
                          : 'neutral'
                  }
                >
                  {t(`observability.level.${log.level}`)}
                </Badge>
              </TableCell>
              <TableCell label={t('observability.logsMessage')}>
                {describeLog(log, t).text}
              </TableCell>
              <TableCell stack="actions" className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onOpen(log)}>
                  {t('observability.details')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && <TableEmpty colSpan={4}>{emptyLabel}</TableEmpty>}
        </TableBody>
      </Table>
    </TableRoot>
  )
}
