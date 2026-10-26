import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { pathProblem, redirectErrorMessage } from '../redirects/redirect-errors.js'
import {
  Button,
  Field,
  Input,
  Modal,
  Notice,
  SavedIndicator,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
  useSavedIndicator,
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
 *
 * Fiche 21 task 3 merges this screen under `/seo`'s "Redirections" tab —
 * `SeoRoute` already gates the whole screen to `admin` before any tab
 * renders, so `RedirectsPanel` below carries no admin check or heading of
 * its own, only the form, table and sub-panels. `/redirects` itself now
 * just redirects to `/seo` (see `app.tsx`), the same pattern `/site-plan`
 * already used for its own rename.
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

const STATUS_SHORT_KEY: Record<Redirect['status'], string> = {
  301: 'redirects.shortPermanent',
  302: 'redirects.shortTemporary',
  307: 'redirects.shortTemporaryStrict',
  308: 'redirects.shortPermanentStrict',
  410: 'redirects.shortGone',
}

export function RedirectsPanel(): JSX.Element {
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

  const [fieldError, setFieldError] = useState<{
    readonly field: 'from' | 'to'
    readonly message: string
  } | null>(null)
  // A rule already leaves this path: nothing is written until the editor has
  // seen what it does today and agreed to replace it.
  const [replacing, setReplacing] = useState<Redirect | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Redirect | null>(null)
  const saved = useSavedIndicator()

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
      setError(redirectErrorMessage(caught, 'redirects.loadError', t))
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

  function describePathProblem(problem: NonNullable<ReturnType<typeof pathProblem>>): string {
    return t(`redirects.pathProblem.${problem}`)
  }

  /** Validates the form; on success returns the normalised values to send. */
  function validate(): { readonly from: string; readonly to: string } | null {
    setFieldError(null)
    const fromProblem = pathProblem(from)
    if (fromProblem !== null) {
      setFieldError({ field: 'from', message: describePathProblem(fromProblem) })
      return null
    }
    if (from.trim() === '/') {
      setFieldError({ field: 'from', message: t('redirects.errors.root') })
      return null
    }
    if (status === 410) return { from: from.trim(), to: '' }
    const toProblem = pathProblem(to)
    if (toProblem !== null) {
      setFieldError({
        field: 'to',
        message:
          toProblem === 'empty' ? t('redirects.errors.missingTo') : describePathProblem(toProblem),
      })
      return null
    }
    if (from.trim().replace(/\/+$/u, '') === to.trim().replace(/\/+$/u, '')) {
      setFieldError({ field: 'to', message: t('redirects.errors.loop') })
      return null
    }
    return { from: from.trim(), to: to.trim() }
  }

  async function write(values: { readonly from: string; readonly to: string }): Promise<void> {
    if (token === null) return
    setSaving(true)
    setError(null)
    try {
      await createRedirect(token, {
        from: values.from,
        ...(status === 410 ? {} : { to: values.to }),
        status,
      })
      setFrom('')
      setTo('')
      setStatus(301)
      setReplacing(null)
      await load()
      saved.show()
    } catch (caught) {
      setReplacing(null)
      setError(redirectErrorMessage(caught, 'redirects.createError', t))
    } finally {
      setSaving(false)
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    saved.hide()
    setError(null)
    const values = validate()
    if (values === null) return
    // One path has one rule, and the server replaces silently. Ask first.
    try {
      const matches = await listRedirects(token, { q: values.from, limit: 50 })
      const existing = matches.data.find(
        (rule) => rule.from.replace(/\/+$/u, '') === values.from.replace(/\/+$/u, ''),
      )
      if (existing !== undefined) {
        setReplacing(existing)
        return
      }
    } catch {
      // The check is a courtesy: if the list cannot be read, the write below
      // reports the real problem.
    }
    await write(values)
  }

  async function remove(redirect: Redirect): Promise<void> {
    if (token === null) return
    setError(null)
    setPendingDelete(null)
    try {
      await deleteRedirect(token, redirect.from)
      await load()
      saved.show()
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.deleteError', t))
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
    saved.hide()
    if (editStatus !== 410) {
      const problem = pathProblem(editTo)
      if (problem !== null) {
        setError(
          problem === 'empty'
            ? t('redirects.errors.missingTo')
            : t(`redirects.pathProblem.${problem}`),
        )
        return
      }
      if (editTo.trim() === editingFrom) {
        setError(t('redirects.errors.loop'))
        return
      }
    }
    try {
      await updateRedirect(token, editingFrom, {
        ...(editStatus === 410 ? {} : { to: editTo.trim() }),
        status: editStatus,
      })
      setEditingFrom(null)
      await load()
      saved.show()
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.editError', t))
    }
  }

  // Defense in depth only — `SeoRoute` already refuses this whole screen to
  // a non-admin before this tab's panel ever mounts.
  if (!isAdmin) {
    return <p role="alert">{t('redirects.adminOnly')}</p>
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h2 className="m-0 text-lg leading-7 font-semibold">{t('redirects.heading')}</h2>
        <p className="text-muted-foreground text-sm">{t('redirects.description')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="flex flex-wrap items-start gap-4"
      >
        <div className="min-w-48 flex-1 basis-56" id="redirects-from-field">
          <Field
            label={t('redirects.from')}
            description={t('redirects.fromHint')}
            error={fieldError?.field === 'from' ? fieldError.message : null}
          >
            {(control) => (
              <Input
                {...control}
                placeholder={t('redirects.fromPlaceholder')}
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="min-w-48 flex-1 basis-56">
          <Field
            label={t('redirects.to')}
            description={status === 410 ? t('redirects.toOptionalHint') : t('redirects.toHint')}
            error={fieldError?.field === 'to' ? fieldError.message : null}
          >
            {(control) => (
              <Input
                {...control}
                disabled={status === 410}
                placeholder={t('redirects.toPlaceholder')}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="min-w-48 flex-1 basis-56">
          <Field label={t('redirects.status')} description={t('redirects.statusHint')}>
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
        <div className="flex items-center gap-3 sm:pt-[1.625rem]">
          <Button type="submit" disabled={saving}>
            {t('redirects.create')}
          </Button>
          <SavedIndicator visible={saved.visible} label={t('redirects.saved')} />
        </div>
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
          <TableRoot label={t('redirects.tableLabel')} stacked>
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
                      <TableCell stack="heading" className="font-mono text-sm">
                        {redirect.from}
                      </TableCell>
                      <TableCell label={t('redirects.to')}>
                        <Input
                          aria-label={t('redirects.to')}
                          disabled={editStatus === 410}
                          value={editTo}
                          onChange={(event) => setEditTo(event.target.value)}
                        />
                      </TableCell>
                      <TableCell label={t('redirects.status')}>
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
                      <TableCell stack="actions" className="flex gap-2">
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
                      <TableCell stack="heading" className="font-mono text-sm">
                        {redirect.from}
                      </TableCell>
                      <TableCell label={t('redirects.to')} className="font-mono text-sm">
                        {redirect.status === 410 ? '—' : redirect.to}
                      </TableCell>
                      <TableCell label={t('redirects.status')}>
                        {redirect.status} · {t(STATUS_SHORT_KEY[redirect.status])}
                      </TableCell>
                      <TableCell stack="actions" className="flex gap-2">
                        <Button size="sm" onClick={() => startEdit(redirect)}>
                          {t('redirects.edit')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setPendingDelete(redirect)}
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

      <Modal
        open={replacing !== null}
        onOpenChange={(open) => {
          if (!open) setReplacing(null)
        }}
        title={t('redirects.replaceTitle')}
        description={
          replacing === null
            ? undefined
            : t('redirects.replaceDescription', {
                from: replacing.from,
                current:
                  replacing.status === 410
                    ? t('redirects.shortGone')
                    : `${replacing.to} (${replacing.status})`,
              })
        }
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReplacing(null)}>
              {t('redirects.cancel')}
            </Button>
            <Button
              loading={saving}
              onClick={() => {
                const values = validate()
                if (values !== null) void write(values)
              }}
            >
              {t('redirects.replaceConfirm')}
            </Button>
          </>
        }
      >
        <p className="m-0 text-sm text-muted-foreground">
          {t('redirects.replaceNew', {
            to: status === 410 ? t('redirects.shortGone') : `${to} (${status})`,
          })}
        </p>
      </Modal>

      <Modal
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={t('redirects.deleteTitle')}
        description={
          pendingDelete === null
            ? undefined
            : t('redirects.deleteDescription', { from: pendingDelete.from })
        }
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              {t('redirects.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete !== null) void remove(pendingDelete)
              }}
            >
              {t('redirects.delete')}
            </Button>
          </>
        }
      >
        <p className="m-0 text-sm text-muted-foreground">{t('redirects.deleteWarning')}</p>
      </Modal>

      {token !== null && <PatternPanel token={token} />}
      {token !== null && <NotFoundPanel token={token} onCreateRedirect={startCreateFromPath} />}
      {token !== null && <ImportExportPanel token={token} />}
    </div>
  )
}
