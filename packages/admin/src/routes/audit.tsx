import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  type AuditActorKind,
  type AuditEntry,
  type AuditEntryDetail,
  type AuditIntegrityStatus,
  exportAuditLog,
  getAuditEntryDetail,
  getAuditIntegrityStatus,
  listAuditEntries,
  runAuditIntegrityCheck,
} from '../api/audit-client.js'
import { ApiError } from '../api/client.js'
import { listUsers } from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Field,
  Input,
  Modal,
  Notice,
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
import { DiffView } from '../versions/diff-view.js'

const ACTOR_KINDS: readonly AuditActorKind[] = ['human', 'agent', 'api_key', 'system']

function isoStartOfDay(daysAgo: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString()
}

/** L2 task 14 / fiche 21: a consultable, filterable view over `@cogenta/auth`'s hash-chained audit log — read-only, `admin` only (the API refuses everyone else with 403). */
/** Same local pattern `collection-list.tsx` already uses: `Intl.DateTimeFormat` in the admin's own language, falling back to the raw string on an unparseable date rather than throwing. */
function formatDateTime(iso: string, locale: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}

export function AuditRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [actorId, setActorId] = useState('')
  const [action, setAction] = useState('')
  const [collection, setCollection] = useState('')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [actorKind, setActorKind] = useState<AuditActorKind | ''>('')
  const [entries, setEntries] = useState<readonly AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [integrity, setIntegrity] = useState<AuditIntegrityStatus | null>(null)
  const [integrityChecking, setIntegrityChecking] = useState(false)
  const [integrityError, setIntegrityError] = useState<string | null>(null)

  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AuditEntryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  /** Actor ids resolved to an email, same best-effort pattern `version-history.tsx` and `trash.tsx` already use — a 403 (impossible here, this route is already admin-only) or a deleted account just leaves the id showing. */
  const [actorNames, setActorNames] = useState<ReadonlyMap<string, string>>(new Map())

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const found = await listAuditEntries(token, {
        ...(actorId === '' ? {} : { actorId }),
        ...(action === '' ? {} : { action }),
        ...(collection === '' ? {} : { collection }),
        ...(since === '' ? {} : { since }),
        ...(until === '' ? {} : { until }),
        ...(actorKind === '' ? {} : { actorKind }),
      })
      setEntries(found)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('audit.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, actorId, action, collection, since, until, actorKind, t])

  const loadIntegrity = useCallback(async () => {
    if (token === null || !isAdmin) return
    try {
      setIntegrity(await getAuditIntegrityStatus(token))
    } catch {
      // The status panel is a convenience, not a gate — a failed read here
      // must not stop the log itself from being readable.
    }
  }, [token, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadIntegrity()
  }, [loadIntegrity])

  useEffect(() => {
    if (token === null || !isAdmin) {
      setActorNames(new Map())
      return
    }
    let cancelled = false
    listUsers(token)
      .then((users) => {
        if (!cancelled) setActorNames(new Map(users.map((user) => [user.id, user.email])))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token, isAdmin])

  function submitFilters(event: FormEvent): void {
    event.preventDefault()
    void load()
  }

  function quickRange(days: number): void {
    setSince(isoStartOfDay(days))
    setUntil('')
  }

  async function runIntegrityCheck(): Promise<void> {
    if (token === null) return
    setIntegrityChecking(true)
    setIntegrityError(null)
    try {
      setIntegrity(await runAuditIntegrityCheck(token))
    } catch (caught) {
      setIntegrityError(caught instanceof ApiError ? caught.message : t('audit.verifyError'))
    } finally {
      setIntegrityChecking(false)
    }
  }

  async function runExport(format: 'csv' | 'json'): Promise<void> {
    if (token === null) return
    setExporting(format)
    setExportError(null)
    try {
      await exportAuditLog(token, format, {
        ...(actorId === '' ? {} : { actorId }),
        ...(action === '' ? {} : { action }),
        ...(collection === '' ? {} : { collection }),
        ...(since === '' ? {} : { since }),
        ...(until === '' ? {} : { until }),
        ...(actorKind === '' ? {} : { actorKind }),
      })
    } catch (caught) {
      setExportError(caught instanceof ApiError ? caught.message : t('audit.exportError'))
    } finally {
      setExporting(null)
    }
  }

  async function openDetail(id: string): Promise<void> {
    setDetailId(id)
    setDetail(null)
    setDetailError(null)
    if (token === null) return
    setDetailLoading(true)
    try {
      setDetail(await getAuditEntryDetail(token, id))
    } catch (caught) {
      setDetailError(caught instanceof ApiError ? caught.message : t('audit.detailError'))
    } finally {
      setDetailLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="audit-heading">
        <h1 id="audit-heading">{t('audit.heading')}</h1>
        <p role="alert">{t('audit.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="audit-heading" className="flex flex-col gap-6">
      <h1 id="audit-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('audit.heading')}
      </h1>

      <IntegrityPanel
        status={integrity}
        checking={integrityChecking}
        error={integrityError}
        onRunNow={() => void runIntegrityCheck()}
      />

      <form onSubmit={submitFilters} className="flex flex-wrap items-end gap-3">
        <div className="max-w-xs">
          <Field label={t('audit.actor')}>
            {(control) => (
              <Input
                {...control}
                value={actorId}
                onChange={(event) => setActorId(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="max-w-xs">
          <Field label={t('audit.action')}>
            {(control) => (
              <Input
                {...control}
                value={action}
                onChange={(event) => setAction(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="max-w-xs">
          <Field label={t('audit.collection')}>
            {(control) => (
              <Input
                {...control}
                value={collection}
                onChange={(event) => setCollection(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="max-w-xs">
          <Field label={t('audit.actorKindLabel')}>
            {(control) => (
              <Select
                {...control}
                value={actorKind}
                onChange={(event) => setActorKind(event.target.value as AuditActorKind | '')}
              >
                <option value="">{t('audit.actorKindAll')}</option>
                {ACTOR_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`audit.actorKind.${kind}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="max-w-xs">
          <Field label={t('audit.since')}>
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                value={since.slice(0, 16)}
                onChange={(event) =>
                  setSince(
                    event.target.value === '' ? '' : new Date(event.target.value).toISOString(),
                  )
                }
              />
            )}
          </Field>
        </div>
        <div className="max-w-xs">
          <Field label={t('audit.until')}>
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                value={until.slice(0, 16)}
                onChange={(event) =>
                  setUntil(
                    event.target.value === '' ? '' : new Date(event.target.value).toISOString(),
                  )
                }
              />
            )}
          </Field>
        </div>
        <Button type="submit">{t('audit.filter')}</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => quickRange(0)}>
          {t('audit.rangeToday')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => quickRange(7)}>
          {t('audit.range7d')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => quickRange(30)}>
          {t('audit.range30d')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSince('')
            setUntil('')
          }}
        >
          {t('audit.rangeClear')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={exporting !== null}
          onClick={() => void runExport('csv')}
        >
          {exporting === 'csv' ? t('audit.exporting') : t('audit.exportCsv')}
        </Button>
        <Button
          variant="secondary"
          disabled={exporting !== null}
          onClick={() => void runExport('json')}
        >
          {exporting === 'json' ? t('audit.exporting') : t('audit.exportJson')}
        </Button>
        {exportError !== null && (
          <Notice tone="danger" live="assertive">
            <p>{exportError}</p>
          </Notice>
        )}
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <TableRoot label={t('audit.heading')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('audit.date')}</TableHeader>
                <TableHeader>{t('audit.actor')}</TableHeader>
                <TableHeader>{t('audit.roles')}</TableHeader>
                <TableHeader>{t('audit.action')}</TableHeader>
                <TableHeader>{t('audit.collection')}</TableHeader>
                <TableHeader>{t('audit.entry')}</TableHeader>
                <TableHeader>{t('audit.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <span title={entry.at}>{formatDateTime(entry.at, i18n.language)}</span>
                  </TableCell>
                  <TableCell>
                    {entry.actorId === null
                      ? '—'
                      : (actorNames.get(entry.actorId) ?? entry.actorId)}
                  </TableCell>
                  <TableCell>{entry.actorRoles.join(', ')}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>{entry.collection ?? '—'}</TableCell>
                  <TableCell>{entry.entryId ?? '—'}</TableCell>
                  <TableCell>
                    <Button variant="secondary" size="sm" onClick={() => void openDetail(entry.id)}>
                      {t('audit.viewDetail')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && <TableEmpty colSpan={7}>{t('audit.noEntries')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <RetentionNotice />

      <Modal
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        title={t('audit.detailTitle')}
        closeLabel={t('audit.close')}
      >
        {detailLoading && <p>{t('common.loading')}</p>}
        {detailError !== null && (
          <Notice tone="danger" live="assertive">
            <p>{detailError}</p>
          </Notice>
        )}
        {detail !== null && <EntryDetail detail={detail} />}
      </Modal>
    </section>
  )
}

function IntegrityPanel({
  status,
  checking,
  error,
  onRunNow,
}: {
  readonly status: AuditIntegrityStatus | null
  readonly checking: boolean
  readonly error: string | null
  onRunNow(): void
}): JSX.Element | null {
  const { t } = useTranslation()
  // `null` means this site never wired a scheduled check up at all — say
  // nothing rather than a confusing "unknown" state.
  if (status === null) return null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 font-medium">{t('audit.integrityHeading')}</p>
          <p className="m-0 text-sm text-muted-foreground">
            {status.state === 'never-run'
              ? t('audit.integrityNeverRun')
              : status.lastCheckedAt === null
                ? t('audit.integrityNeverRun')
                : t('audit.integrityLastChecked', {
                    at: status.lastCheckedAt,
                    mode:
                      status.lastMode === null
                        ? '?'
                        : t(`audit.integrityMode.${status.lastMode}`, {
                            defaultValue: status.lastMode,
                          }),
                  })}
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={checking} onClick={onRunNow}>
          {checking ? t('audit.verifying') : t('audit.verify')}
        </Button>
      </div>
      {status.state === 'broken' && (
        <Notice tone="danger" live="assertive">
          <p>{t('audit.integrityBroken', { entryId: status.brokenEntryId ?? '?' })}</p>
        </Notice>
      )}
      {status.state === 'ok' && status.lastCheckedAt !== null && (
        <p className="m-0 text-sm" role="status">
          {t('audit.integrityOk')}
        </p>
      )}
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
    </div>
  )
}

function EntryDetail({ detail }: { readonly detail: AuditEntryDetail }): JSX.Element {
  const { t, i18n } = useTranslation()
  const { entry } = detail

  return (
    <dl className="flex flex-col gap-3 text-sm">
      <Row label={t('audit.detailDate')}>
        <span title={entry.at}>{formatDateTime(entry.at, i18n.language)}</span>
      </Row>
      <Row label={t('audit.detailActor')}>
        {detail.actorLabel ?? entry.actorId ?? t('audit.detailSystemActor')}
      </Row>
      <Row label={t('audit.detailActorKind')}>{t(`audit.actorKind.${detail.actorKind}`)}</Row>
      <Row label={t('audit.detailRoles')}>
        {entry.actorRoles.length === 0 ? '—' : entry.actorRoles.join(', ')}
      </Row>
      <Row label={t('audit.detailAction')}>{entry.action}</Row>
      {entry.collection !== null && entry.entryId !== null && (
        <Row label={t('audit.detailEntry')}>
          <Link to={`/collections/${entry.collection}/${entry.entryId}`}>
            {entry.collection} / {entry.entryId}
          </Link>
        </Row>
      )}
      <div>
        <p className="m-0 font-medium">{t('audit.detailDiff')}</p>
        {detail.diff !== null && <DiffView diff={detail.diff} />}
        {detail.diff === null && detail.diffUnavailable !== null && (
          <p className="m-0 text-muted-foreground">
            {t(`audit.diffUnavailable.${detail.diffUnavailable}`, {
              defaultValue: detail.diffUnavailable,
            })}
          </p>
        )}
      </div>
    </dl>
  )
}

function Row({
  label,
  children,
}: {
  readonly label: string
  readonly children: JSX.Element | string
}): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  )
}

/** Fiche 21 task 5: honest, not silent — a journal with no purge configured grows without limit, and that is worth saying rather than leaving unexplained. */
function RetentionNotice(): JSX.Element {
  const { t } = useTranslation()
  return (
    <Notice tone="info" live="off">
      <p>{t('audit.retentionUnbounded')}</p>
    </Notice>
  )
}
