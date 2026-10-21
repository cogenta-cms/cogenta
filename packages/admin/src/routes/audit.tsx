import { type FormEvent, type JSX, useCallback, useEffect, useRef, useState } from 'react'
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
  listAuditEntriesPage,
  runAuditIntegrityCheck,
} from '../api/audit-client.js'
import { listApiKeysPage } from '../api/api-keys-client.js'
import { ApiError } from '../api/client.js'
import { listUsers } from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import { auditActionLabel, auditActorLabel, KNOWN_AUDIT_ACTIONS } from '../lib/audit-actions.js'
import { roleLabels } from '../lib/role-label.js'
import { useSchema } from '../schema/schema-context.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import {
  Button,
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
import { DiffView } from '../versions/diff-view.js'

const ACTOR_KINDS: readonly AuditActorKind[] = ['human', 'agent', 'api_key', 'system']
const PAGE_SIZE = 20

function isoStartOfDay(daysAgo: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString()
}

/** L2 task 14 / fiche 21: a consultable, filterable view over `@cogenta/auth`'s hash-chained audit log — read-only, `admin` only (the API refuses everyone else with 403). */
export function AuditRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const formatWhen = useDateTimeFormatter()
  const schemaState = useSchema()
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
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [paging, setPaging] = useState<{
    readonly key: string
    readonly cursors: readonly (string | undefined)[]
  }>({ key: '', cursors: [undefined] })
  const requestGeneration = useRef(0)

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
  const [verifiedNow, setVerifiedNow] = useState(false)

  const filterKey = JSON.stringify([actorId, action, collection, since, until, actorKind])
  const cursors = paging.key === filterKey ? paging.cursors : [undefined]
  const cursor = cursors[cursors.length - 1]
  useEffect(() => {
    setPaging((current) =>
      current.key === filterKey ? current : { key: filterKey, cursors: [undefined] },
    )
  }, [filterKey])
  function changePage(next: number): void {
    if (next < cursors.length - 1)
      setPaging({ key: filterKey, cursors: cursors.slice(0, next + 1) })
    else if (nextCursor !== null && hasMore)
      setPaging({ key: filterKey, cursors: [...cursors, nextCursor] })
  }
  const pager = (
    <Pagination
      variant="pages"
      page={cursors.length - 1}
      pageCount={cursors.length + (hasMore ? 1 : 0)}
      onPageChange={changePage}
      loading={loading}
      previousLabel={t('lists.previous')}
      nextLabel={t('lists.next')}
      pageInfo={t('lists.page', { page: cursors.length })}
    />
  )

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    const generation = ++requestGeneration.current
    setLoading(true)
    setError(null)
    try {
      const page = await listAuditEntriesPage(token, {
        ...(actorId === '' ? {} : { actorId }),
        ...(action === '' ? {} : { action }),
        ...(collection === '' ? {} : { collection }),
        ...(since === '' ? {} : { since }),
        ...(until === '' ? {} : { until }),
        ...(actorKind === '' ? {} : { actorKind }),
        limit: PAGE_SIZE,
        ...(cursor === undefined ? {} : { after: cursor }),
      })
      if (generation !== requestGeneration.current) return
      setEntries(page.entries)
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
    } catch (caught) {
      if (generation === requestGeneration.current)
        setError(caught instanceof ApiError ? caught.message : t('audit.loadError'))
    } finally {
      if (generation === requestGeneration.current) setLoading(false)
    }
  }, [token, isAdmin, actorId, action, collection, since, until, actorKind, cursor, t])

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
    return () => {
      requestGeneration.current += 1
    }
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
    void Promise.all([
      listUsers(token).catch(() => []),
      listApiKeysPage(token, { limit: 100 }).then(
        (page) => page.keys,
        () => [],
      ),
    ]).then(([users, keys]) => {
      if (cancelled) return
      setActorNames(
        new Map<string, string>([
          ...users.map((user): [string, string] => [user.id, user.email]),
          ...keys.map((key): [string, string] => [`apikey:${key.id}`, key.name]),
        ]),
      )
    })
    return () => {
      cancelled = true
    }
  }, [token, isAdmin])

  function submitFilters(event: FormEvent): void {
    event.preventDefault()
    if (cursor === undefined) void load()
    else setPaging({ key: filterKey, cursors: [undefined] })
  }

  function quickRange(days: number): void {
    setSince(isoStartOfDay(days))
    setUntil('')
  }

  async function runIntegrityCheck(): Promise<void> {
    if (token === null) return
    setIntegrityChecking(true)
    setIntegrityError(null)
    setVerifiedNow(false)
    try {
      setIntegrity(await runAuditIntegrityCheck(token))
      setVerifiedNow(true)
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

  const actionOptions = [
    ...new Set([...KNOWN_AUDIT_ACTIONS, ...entries.map((entry) => entry.action), action]),
  ]
    .filter((id) => id !== '')
    .sort((a, b) => auditActionLabel(t, a).localeCompare(auditActionLabel(t, b), i18n.language))
  const collectionOptions = [
    ...new Map(
      [
        ...(schemaState.status === 'ready'
          ? schemaState.schema.collections.map((c): [string, string] => [c.name, c.labels.plural])
          : []),
        ...entries.flatMap((entry): [string, string][] =>
          entry.collection === null ? [] : [[entry.collection, entry.collection]],
        ),
        ...(collection === '' ? [] : ([[collection, collection]] as [string, string][])),
      ].reverse(),
    ),
  ]
    .reverse()
    .map(([name, label]) => ({ name, label }))

  if (!isAdmin) {
    return (
      <section aria-labelledby="audit-heading">
        <h1 id="audit-heading">{t('audit.heading')}</h1>
        <p role="alert">{t('audit.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 id="audit-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
        {t('audit.heading')}
      </h1>

      <IntegrityPanel
        status={integrity}
        checking={integrityChecking}
        error={integrityError}
        justVerified={verifiedNow}
        onRunNow={() => void runIntegrityCheck()}
      />

      <form
        onSubmit={submitFilters}
        aria-label={t('audit.filtersLabel')}
        className="flex flex-col gap-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label={t('audit.actor')}>
            {(control) => (
              <Select
                {...control}
                value={actorId}
                onChange={(event) => setActorId(event.target.value)}
              >
                <option value="">{t('audit.actorFilterAll')}</option>
                {[...actorNames]
                  .filter(([id]) => !id.startsWith('apikey:'))
                  .sort((a, b) => a[1].localeCompare(b[1]))
                  .map(([id, email]) => (
                    <option key={id} value={id}>
                      {email}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t('audit.action')}>
            {(control) => (
              <Select
                {...control}
                value={action}
                onChange={(event) => setAction(event.target.value)}
              >
                <option value="">{t('audit.actionFilterAll')}</option>
                {actionOptions.map((id) => (
                  <option key={id} value={id}>
                    {auditActionLabel(t, id)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('audit.collection')}>
            {(control) => (
              <Select
                {...control}
                value={collection}
                onChange={(event) => setCollection(event.target.value)}
              >
                <option value="">{t('audit.collectionFilterAll')}</option>
                {collectionOptions.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
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
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">{t('audit.filter')}</Button>
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
      </form>

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

      {!loading && error === null && pager}
      {!loading && error === null && (
        <TableRoot label={t('audit.heading')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('audit.date')}</TableHeader>
                <TableHeader>{t('audit.action')}</TableHeader>
                <TableHeader>{t('audit.actor')}</TableHeader>
                <TableHeader>{t('audit.roles')}</TableHeader>
                <TableHeader>{t('audit.collection')}</TableHeader>
                <TableHeader>{t('audit.entry')}</TableHeader>
                <TableHeader>{t('audit.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap" label={t('audit.date')}>
                    <span title={entry.at}>{formatWhen(entry.at)}</span>
                  </TableCell>
                  <TableCell stack="heading">{auditActionLabel(t, entry.action)}</TableCell>
                  <TableCell label={t('audit.actor')}>
                    {auditActorLabel(t, entry.actorId, actorNames)}
                  </TableCell>
                  <TableCell label={t('audit.roles')}>
                    {entry.actorRoles.length === 0 ? '—' : roleLabels(t, entry.actorRoles)}
                  </TableCell>
                  <TableCell label={t('audit.collection')}>
                    {entry.collection === null
                      ? '—'
                      : (collectionOptions.find((option) => option.name === entry.collection)
                          ?.label ?? entry.collection)}
                  </TableCell>
                  <TableCell label={t('audit.entry')}>
                    {entry.collection !== null && entry.entryId !== null ? (
                      <Link
                        to={`/collections/${entry.collection}/${entry.entryId}`}
                        title={entry.entryId}
                      >
                        {t('audit.openEntry')}
                      </Link>
                    ) : entry.entryId !== null && actorNames.has(entry.entryId) ? (
                      t('audit.targetAccount', { email: actorNames.get(entry.entryId) })
                    ) : (
                      (entry.entryId ?? '—')
                    )}
                  </TableCell>
                  <TableCell stack="actions">
                    <Button variant="secondary" size="sm" onClick={() => void openDetail(entry.id)}>
                      {t('audit.viewDetailShort')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && <TableEmpty colSpan={7}>{t('audit.noEntries')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {!loading && pager}

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
  justVerified,
  onRunNow,
}: {
  readonly status: AuditIntegrityStatus | null
  readonly checking: boolean
  readonly error: string | null
  readonly justVerified: boolean
  onRunNow(): void
}): JSX.Element | null {
  const { t } = useTranslation()
  const formatWhen = useDateTimeFormatter()
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
                    at: formatWhen(status.lastCheckedAt),
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
          {justVerified ? t('audit.verifyDone') : t('audit.integrityOk')}
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
  const { t } = useTranslation()
  const formatWhen = useDateTimeFormatter()
  const { entry } = detail

  return (
    <dl className="flex flex-col gap-3 text-sm">
      <Row label={t('audit.detailDate')}>
        <span title={entry.at}>{formatWhen(entry.at)}</span>
      </Row>
      <Row label={t('audit.detailActor')}>
        {detail.actorLabel ?? auditActorLabel(t, entry.actorId, new Map())}
      </Row>
      <Row label={t('audit.detailActorKind')}>{t(`audit.actorKind.${detail.actorKind}`)}</Row>
      <Row label={t('audit.detailRoles')}>
        {entry.actorRoles.length === 0 ? '—' : roleLabels(t, entry.actorRoles)}
      </Row>
      <Row label={t('audit.detailAction')}>
        {auditActionLabel(t, entry.action)}
      </Row>
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
