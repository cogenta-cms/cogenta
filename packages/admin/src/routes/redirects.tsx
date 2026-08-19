import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/http.js'
import {
  createRedirect,
  deleteRedirect,
  listRedirects,
  type Redirect,
  updateRedirect,
} from '../api/redirects-client.js'
import { useAuth } from '../auth/auth-context.js'
import { ImportExportPanel } from '../redirects/import-export-panel.js'
import { NotFoundPanel } from '../redirects/not-found-panel.js'
import { PatternPanel } from '../redirects/pattern-panel.js'
import {
  Button,
  Field,
  Input,
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

/**
 * `/api/redirects` — the admin screen the redirect table never had.
 *
 * The store and its wiring into every public GET have existed since L10
 * task 2; this is the missing route from a browser to it (audit follow-up),
 * extended by fiche 12 with editing, search/pagination, prefix patterns, the
 * 404 log and CSV import/export. Admin-only, like the server route itself —
 * a redirect is a routing decision, not content, so unlike taxonomies or
 * menus there is no reader role to show a plain list to.
 *
 * Loop and self-redirect refusal is entirely the server's job: this screen
 * shows whatever it says rather than re-validating client-side, which would
 * only risk disagreeing with it.
 */

const STATUSES: readonly Redirect['status'][] = [301, 302, 307, 308, 410]
const PAGE_SIZE = 20

const STATUS_LABEL_KEY: Record<Redirect['status'], string> = {
  301: 'redirects.permanent',
  302: 'redirects.temporary',
  307: 'redirects.temporaryStrict',
  308: 'redirects.permanentStrict',
  410: 'redirects.gone',
}

export function RedirectsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [redirects, setRedirects] = useState<readonly Redirect[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<Redirect['status']>(301)
  const [saving, setSaving] = useState(false)

  const [editingFrom, setEditingFrom] = useState<string | null>(null)
  const [editTo, setEditTo] = useState('')
  const [editStatus, setEditStatus] = useState<Redirect['status']>(301)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const result = await listRedirects(token, {
        ...(query.trim() === '' ? {} : { q: query.trim() }),
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      setRedirects(result.data)
      setTotal(result.total)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('redirects.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, query, page, t])

  useEffect(() => {
    void load()
  }, [load])

  function startCreateFromPath(path: string): void {
    setFrom(path)
    setTo('')
    setStatus(301)
    document
      .getElementById('redirects-from-field')
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSaving(true)
    setError(null)
    try {
      await createRedirect(token, {
        from,
        ...(status === 410 ? {} : { to }),
        status,
      })
      setFrom('')
      setTo('')
      setStatus(301)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('redirects.createError'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(redirect: Redirect): Promise<void> {
    if (token === null) return
    setError(null)
    try {
      await deleteRedirect(token, redirect.from)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('redirects.deleteError'))
    }
  }

  function startEdit(redirect: Redirect): void {
    setEditingFrom(redirect.from)
    setEditTo(redirect.to)
    setEditStatus(redirect.status)
  }

  async function saveEdit(): Promise<void> {
    if (token === null || editingFrom === null) return
    setError(null)
    try {
      await updateRedirect(token, editingFrom, {
        ...(editStatus === 410 ? {} : { to: editTo }),
        status: editStatus,
      })
      setEditingFrom(null)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('redirects.editError'))
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="redirects-heading">
        <h1 id="redirects-heading">{t('redirects.heading')}</h1>
        <p role="alert">{t('redirects.adminOnly')}</p>
      </section>
    )
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section aria-labelledby="redirects-heading" className="flex flex-col gap-10">
      <div>
        <h1 id="redirects-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('redirects.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('redirects.description')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-4">
        <div className="min-w-48" id="redirects-from-field">
          <Field label={t('redirects.from')} description={t('redirects.fromHint')}>
            {(control) => (
              <Input
                {...control}
                required
                placeholder="/old-page"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="min-w-48">
          <Field
            label={t('redirects.to')}
            description={status === 410 ? t('redirects.toOptionalHint') : undefined}
          >
            {(control) => (
              <Input
                {...control}
                required={status !== 410}
                disabled={status === 410}
                placeholder="/new-page"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="min-w-48">
          <Field label={t('redirects.status')}>
            {(control) => (
              <Select
                {...control}
                value={status}
                onChange={(event) => setStatus(Number(event.target.value) as Redirect['status'])}
              >
                {STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {t(STATUS_LABEL_KEY[option])}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button type="submit" disabled={saving}>
          {t('redirects.create')}
        </Button>
      </form>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-64">
          <Field label={t('redirects.searchLabel')}>
            {(control) => (
              <Input
                {...control}
                placeholder={t('redirects.searchPlaceholder')}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(0)
                }}
              />
            )}
          </Field>
        </div>
      </div>

      {loading && <p>{t('common.loading')}</p>}

      {!loading && (
        <>
          <TableRoot label={t('redirects.tableLabel')}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('redirects.from')}</TableHeader>
                  <TableHeader>{t('redirects.to')}</TableHeader>
                  <TableHeader>{t('redirects.status')}</TableHeader>
                  <TableHeader>{t('redirects.actionsColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {redirects.map((redirect) =>
                  editingFrom === redirect.from ? (
                    <TableRow key={redirect.id}>
                      <TableCell className="font-mono text-sm">{redirect.from}</TableCell>
                      <TableCell>
                        <Input
                          aria-label={t('redirects.to')}
                          disabled={editStatus === 410}
                          value={editTo}
                          onChange={(event) => setEditTo(event.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          aria-label={t('redirects.status')}
                          value={editStatus}
                          onChange={(event) =>
                            setEditStatus(Number(event.target.value) as Redirect['status'])
                          }
                        >
                          {STATUSES.map((option) => (
                            <option key={option} value={option}>
                              {t(STATUS_LABEL_KEY[option])}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" onClick={() => void saveEdit()}>
                          {t('redirects.save')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditingFrom(null)}>
                          {t('redirects.cancel')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={redirect.id}>
                      <TableCell className="font-mono text-sm">{redirect.from}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {redirect.status === 410 ? '—' : redirect.to}
                      </TableCell>
                      <TableCell>{redirect.status}</TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" onClick={() => startEdit(redirect)}>
                          {t('redirects.edit')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void remove(redirect)}
                        >
                          {t('redirects.delete')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ),
                )}
                {redirects.length === 0 && (
                  <TableEmpty colSpan={4}>{t('redirects.empty')}</TableEmpty>
                )}
              </TableBody>
            </Table>
          </TableRoot>

          {pageCount > 1 && (
            <div className="flex items-center gap-3 text-sm">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                {t('redirects.previousPage')}
              </Button>
              <span>
                {t('redirects.pageInfo', {
                  from: page * PAGE_SIZE + 1,
                  to: Math.min(total, (page + 1) * PAGE_SIZE),
                  total,
                })}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              >
                {t('redirects.nextPage')}
              </Button>
            </div>
          )}
        </>
      )}

      {token !== null && <PatternPanel token={token} />}
      {token !== null && <NotFoundPanel token={token} onCreateRedirect={startCreateFromPath} />}
      {token !== null && <ImportExportPanel token={token} />}
    </section>
  )
}
