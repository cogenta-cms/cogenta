import { Fragment, type JSX, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  addSubmissionNote,
  bulkSubmissionAction,
  downloadSubmissionsCsv,
  eraseSubmissionsByEmail,
  type FormDefinition,
  type FormFileValue,
  type FormSubmission,
  type FormSubmissionNote,
  type FormSubmissionStatus,
  isFormFileValue,
  listForms,
  listSubmissionNotes,
  listSubmissions,
  markSubmissionStatus,
  searchSubmissionsByEmail,
} from '../api/forms-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useRefreshChromeStatus } from '../shell/shell-status-context.js'
import {
  Button,
  Field,
  Input,
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
 * Fiche 16 task 4 (base) + fiche 47 tasks 7-9 — submissions, per form or
 * across every form: read, mark read/archived/spam, bulk actions, full-text
 * + date-range search, internal notes, the referrer already stored but
 * never shown before fiche 47, a server-streamed CSV export (never capped
 * at what one page loaded — `downloadSubmissionsCsv`), and the GDPR minimum
 * from task 7 of fiche 16 — a search (and erasure) by e-mail address across
 * every submission, for a data subject's export/deletion request.
 *
 * Fiche 67 task 2 — `GET /api/forms/submissions` already answered with a
 * `nextCursor` (`listSubmissions`'s own `ListSubmissionsResult`); this
 * screen just never asked for more than the first 200-row page. It now
 * fetches `PAGE_SIZE` at a time and walks the cursor with the shared
 * `Pagination` component, same "load more" shape `users.tsx` established.
 */

const STATUSES: readonly FormSubmissionStatus[] = ['new', 'read', 'archived', 'spam']
const PAGE_SIZE = 50

function valueText(value: string | readonly string[] | FormFileValue): string {
  if (typeof value === 'string') return value
  if (isFormFileValue(value)) return value.filename
  return value.join(', ')
}

export function FormSubmissionsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')
  const refreshChromeStatus = useRefreshChromeStatus()
  const [searchParams, setSearchParams] = useSearchParams()
  const headingId = useId()

  const formId = searchParams.get('formId') ?? ''
  const statusFilter = (searchParams.get('status') ?? '') as FormSubmissionStatus | ''
  const queryFilter = searchParams.get('q') ?? ''
  const fromFilter = searchParams.get('from') ?? ''
  const toFilter = searchParams.get('to') ?? ''

  const [forms, setForms] = useState<readonly FormDefinition[]>([])
  const [submissions, setSubmissions] = useState<readonly FormSubmission[] | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emailQuery, setEmailQuery] = useState('')
  const [gdprResults, setGdprResults] = useState<readonly FormSubmission[] | null>(null)
  const [gdprMessage, setGdprMessage] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(queryFilter)
  const [notesBySubmission, setNotesBySubmission] = useState<
    Readonly<Record<string, readonly FormSubmissionNote[]>>
  >({})
  const [noteDrafts, setNoteDrafts] = useState<Readonly<Record<string, string>>>({})
  const [exporting, setExporting] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const baseFilter = useMemo(
    () => ({
      ...(formId === '' ? {} : { formId }),
      ...(statusFilter === '' ? {} : { status: statusFilter }),
      ...(queryFilter === '' ? {} : { query: queryFilter }),
      ...(fromFilter === '' ? {} : { from: new Date(fromFilter).toISOString() }),
      ...(toFilter === '' ? {} : { to: new Date(toFilter).toISOString() }),
    }),
    [formId, statusFilter, queryFilter, fromFilter, toFilter],
  )

  const load = useCallback(async () => {
    if (token === null) return
    try {
      const [formList, page] = await Promise.all([
        listForms(token),
        listSubmissions(token, { ...baseFilter, limit: PAGE_SIZE }),
      ])
      setForms(formList)
      setSubmissions(page.items)
      setNextCursor(page.nextCursor)
      setSelected(new Set())
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('formSubmissions.loadError'))
    }
  }, [token, baseFilter, t])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore(): Promise<void> {
    if (token === null || nextCursor === null) return
    setLoadingMore(true)
    try {
      const page = await listSubmissions(token, {
        ...baseFilter,
        limit: PAGE_SIZE,
        cursor: nextCursor,
      })
      setSubmissions((current) => [...(current ?? []), ...page.items])
      setNextCursor(page.nextCursor)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('formSubmissions.loadError'))
    } finally {
      setLoadingMore(false)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby={headingId}>
        <h1 id={headingId}>{t('formSubmissions.heading')}</h1>
        <p role="alert">{t('formSubmissions.adminOnly')}</p>
      </section>
    )
  }

  const formsById = useMemo(() => new Map(forms.map((form) => [form.id, form])), [forms])

  function toggleSelected(id: string): void {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function applyBulk(action: FormSubmissionStatus | 'delete'): Promise<void> {
    if (token === null || selected.size === 0) return
    try {
      await bulkSubmissionAction(token, [...selected], action)
      await load()
      // L20 audit point 15: the sidebar's "Submissions" badge is fetched
      // once per session — without this, marking read/archived/spam here
      // left it showing a stale unread count.
      refreshChromeStatus()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('formSubmissions.bulkError'))
    }
  }

  async function mark(id: string, status: FormSubmissionStatus): Promise<void> {
    if (token === null) return
    try {
      await markSubmissionStatus(token, id, status)
      await load()
      refreshChromeStatus()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('formSubmissions.markError'))
    }
  }

  /** Fiche 47 task 9 — the server-streamed export, applying the exact same filters as the current view. No longer capped at the 200-row page this screen loads for display. */
  async function exportCsv(): Promise<void> {
    if (token === null) return
    setExporting(true)
    setError(null)
    try {
      await downloadSubmissionsCsv(token, {
        ...(formId === '' ? {} : { formId }),
        ...(statusFilter === '' ? {} : { status: statusFilter }),
        ...(queryFilter === '' ? {} : { query: queryFilter }),
        ...(fromFilter === '' ? {} : { from: new Date(fromFilter).toISOString() }),
        ...(toFilter === '' ? {} : { to: new Date(toFilter).toISOString() }),
      })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('formSubmissions.exportError'))
    } finally {
      setExporting(false)
    }
  }

  async function loadNotes(submissionId: string): Promise<void> {
    if (token === null) return
    try {
      const notes = await listSubmissionNotes(token, submissionId)
      setNotesBySubmission((prev) => ({ ...prev, [submissionId]: notes }))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('formSubmissions.notesLoadError'))
    }
  }

  async function saveNote(submissionId: string): Promise<void> {
    if (token === null) return
    const body = (noteDrafts[submissionId] ?? '').trim()
    if (body === '') return
    try {
      await addSubmissionNote(token, submissionId, body)
      setNoteDrafts((prev) => ({ ...prev, [submissionId]: '' }))
      await loadNotes(submissionId)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('formSubmissions.notesSaveError'))
    }
  }

  async function runGdprSearch(): Promise<void> {
    if (token === null || emailQuery.trim() === '') return
    setGdprMessage(null)
    try {
      setGdprResults(await searchSubmissionsByEmail(token, emailQuery.trim()))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('formSubmissions.gdprSearchError'))
    }
  }

  async function runGdprErase(): Promise<void> {
    if (token === null || emailQuery.trim() === '') return
    try {
      const result = await eraseSubmissionsByEmail(token, emailQuery.trim())
      setGdprMessage(t('formSubmissions.gdprErased', { count: result.erased }))
      setGdprResults(null)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('formSubmissions.gdprEraseError'))
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div>
        <h1 id={headingId} className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('formSubmissions.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('formSubmissions.description')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('formSubmissions.filterForm')}>
          {(control) => (
            <Select
              {...control}
              value={formId}
              onChange={(event) =>
                setSearchParams((prev) => setParam(prev, 'formId', event.target.value))
              }
            >
              <option value="">{t('formSubmissions.allForms')}</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('formSubmissions.filterStatus')}>
          {(control) => (
            <Select
              {...control}
              value={statusFilter}
              onChange={(event) =>
                setSearchParams((prev) => setParam(prev, 'status', event.target.value))
              }
            >
              <option value="">{t('formSubmissions.allStatuses')}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`formSubmissions.status.${status}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('formSubmissions.filterFrom')}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={fromFilter}
              onChange={(event) =>
                setSearchParams((prev) => setParam(prev, 'from', event.target.value))
              }
            />
          )}
        </Field>
        <Field label={t('formSubmissions.filterTo')}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={toFilter}
              onChange={(event) =>
                setSearchParams((prev) => setParam(prev, 'to', event.target.value))
              }
            />
          )}
        </Field>
        <Field label={t('formSubmissions.filterQuery')}>
          {(control) => (
            <Input
              {...control}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setSearchParams((prev) => setParam(prev, 'q', searchInput))
                }
              }}
            />
          )}
        </Field>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSearchParams((prev) => setParam(prev, 'q', searchInput))}
        >
          {t('formSubmissions.search')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void exportCsv()}
          disabled={exporting}
        >
          {exporting ? t('common.loading') : t('formSubmissions.exportCsv')}
        </Button>
      </div>

      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label={t('formSubmissions.bulkActionsLabel')}
        >
          <span className="text-sm">
            {t('formSubmissions.selectedCount', { count: selected.size })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void applyBulk('read')}
          >
            {t('formSubmissions.status.read')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void applyBulk('archived')}
          >
            {t('formSubmissions.status.archived')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void applyBulk('spam')}
          >
            {t('formSubmissions.status.spam')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => void applyBulk('delete')}
          >
            {t('formSubmissions.delete')}
          </Button>
        </div>
      )}

      {submissions === null ? (
        <p>{t('common.loading')}</p>
      ) : (
        <TableRoot label={t('formSubmissions.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>
                  <span className="sr-only">{t('formSubmissions.select')}</span>
                </TableHeader>
                <TableHeader>{t('formSubmissions.columnForm')}</TableHeader>
                <TableHeader>{t('formSubmissions.columnStatus')}</TableHeader>
                <TableHeader>{t('formSubmissions.columnSubmittedAt')}</TableHeader>
                <TableHeader>{t('formSubmissions.columnActions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {submissions.length === 0 && (
                <TableEmpty colSpan={5}>{t('formSubmissions.empty')}</TableEmpty>
              )}
              {submissions.map((submission) => (
                <Fragment key={submission.id}>
                  <TableRow>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={t('formSubmissions.selectOne', { id: submission.id })}
                        checked={selected.has(submission.id)}
                        onChange={() => toggleSelected(submission.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{submission.formName}</TableCell>
                    <TableCell>{t(`formSubmissions.status.${submission.status}`)}</TableCell>
                    <TableCell>{new Date(submission.submittedAt).toLocaleString()}</TableCell>
                    <TableCell className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const opening = openId !== submission.id
                          setOpenId(opening ? submission.id : null)
                          if (opening && notesBySubmission[submission.id] === undefined) {
                            void loadNotes(submission.id)
                          }
                        }}
                        aria-expanded={openId === submission.id}
                      >
                        {openId === submission.id
                          ? t('formSubmissions.hide')
                          : t('formSubmissions.view')}
                      </Button>
                      {submission.status !== 'read' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void mark(submission.id, 'read')}
                        >
                          {t('formSubmissions.markRead')}
                        </Button>
                      )}
                      {submission.status !== 'archived' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void mark(submission.id, 'archived')}
                        >
                          {t('formSubmissions.markArchived')}
                        </Button>
                      )}
                      {submission.status !== 'spam' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void mark(submission.id, 'spam')}
                        >
                          {t('formSubmissions.markSpam')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {openId === submission.id && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                          {Object.entries(submission.values).map(([name, value]) => (
                            <div key={name} className="contents">
                              <dt className="font-medium">
                                {formsById
                                  .get(submission.formId)
                                  ?.fields.find((f) => f.name === name)?.label ?? name}
                              </dt>
                              <dd className="m-0">{valueText(value)}</dd>
                            </div>
                          ))}
                          {submission.consents.map((consent) => (
                            <div key={consent.fieldName} className="contents">
                              <dt className="font-medium">{t('formSubmissions.consent')}</dt>
                              <dd className="m-0">
                                {consent.text} ({new Date(consent.agreedAt).toLocaleString()})
                              </dd>
                            </div>
                          ))}
                          {/* Fiche 47 task 8: "référent stocké mais jamais affiché" — shown from here on. */}
                          <div className="contents">
                            <dt className="font-medium">{t('formSubmissions.referrer')}</dt>
                            <dd className="m-0">
                              {submission.referrer ?? t('formSubmissions.noReferrer')}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-4 border-t border-border pt-3">
                          <h3 className="m-0 mb-2 text-sm font-semibold">
                            {t('formSubmissions.notesHeading')}
                          </h3>
                          <ul className="mb-2 flex flex-col gap-1 text-sm">
                            {(notesBySubmission[submission.id] ?? []).length === 0 && (
                              <li className="text-muted-foreground">
                                {t('formSubmissions.notesEmpty')}
                              </li>
                            )}
                            {(notesBySubmission[submission.id] ?? []).map((note) => (
                              <li key={note.id}>
                                <span className="font-medium">{note.authorLabel}</span>
                                {' — '}
                                {note.body}{' '}
                                <span className="text-muted-foreground">
                                  ({new Date(note.createdAt).toLocaleString()})
                                </span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex flex-wrap items-end gap-2">
                            <Field label={t('formSubmissions.addNoteLabel')}>
                              {(control) => (
                                <Input
                                  {...control}
                                  value={noteDrafts[submission.id] ?? ''}
                                  onChange={(event) =>
                                    setNoteDrafts((prev) => ({
                                      ...prev,
                                      [submission.id]: event.target.value,
                                    }))
                                  }
                                />
                              )}
                            </Field>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => void saveNote(submission.id)}
                              disabled={(noteDrafts[submission.id] ?? '').trim() === ''}
                            >
                              {t('formSubmissions.addNote')}
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {submissions !== null && (
        <Pagination
          variant="cursor"
          hasMore={nextCursor !== null}
          loading={loadingMore}
          onLoadMore={() => void loadMore()}
          loadMoreLabel={t('formSubmissions.loadMore')}
          loadingLabel={t('common.loading')}
        />
      )}

      <section aria-labelledby="gdpr-heading" className="rounded-md border border-border p-4">
        <h2 id="gdpr-heading" className="m-0 mb-2 text-base font-semibold">
          {t('formSubmissions.gdprHeading')}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('formSubmissions.gdprDescription')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('formSubmissions.gdprEmailLabel')}>
            {(control) => (
              <Input
                {...control}
                type="email"
                value={emailQuery}
                onChange={(event) => setEmailQuery(event.target.value)}
              />
            )}
          </Field>
          <Button type="button" variant="secondary" onClick={() => void runGdprSearch()}>
            {t('formSubmissions.gdprSearch')}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void runGdprErase()}>
            {t('formSubmissions.gdprErase')}
          </Button>
        </div>
        {gdprMessage !== null && (
          <Notice tone="success">
            <p className="m-0">{gdprMessage}</p>
          </Notice>
        )}
        {gdprResults !== null && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {gdprResults.length === 0 && <li>{t('formSubmissions.gdprNoResults')}</li>}
            {gdprResults.map((submission) => (
              <li key={submission.id}>
                {submission.formName} — {new Date(submission.submittedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

function setParam(prev: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(prev)
  if (value === '') next.delete(key)
  else next.set(key, value)
  return next
}
