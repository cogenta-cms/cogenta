import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  createRedirect,
  deleteRedirect,
  listRedirects,
  type Redirect,
} from '../api/redirects-client.js'
import { useAuth } from '../auth/auth-context.js'
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
 * task 2; this is the missing route from a browser to it (audit follow-up).
 * Admin-only, like the server route itself — a redirect is a routing
 * decision, not content, so unlike taxonomies or menus there is no reader
 * role to show a plain list to.
 *
 * Loop and self-redirect refusal is entirely the server's job: this screen
 * shows whatever it says rather than re-validating client-side, which would
 * only risk disagreeing with it.
 */
export function RedirectsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [redirects, setRedirects] = useState<readonly Redirect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<'301' | '302'>('301')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setRedirects(await listRedirects(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('redirects.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSaving(true)
    setError(null)
    try {
      await createRedirect(token, { from, to, status: status === '302' ? 302 : 301 })
      setFrom('')
      setTo('')
      setStatus('301')
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

  if (!isAdmin) {
    return (
      <section aria-labelledby="redirects-heading">
        <h1 id="redirects-heading">{t('redirects.heading')}</h1>
        <p role="alert">{t('redirects.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="redirects-heading" className="flex flex-col gap-6">
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
        <div className="min-w-48">
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
          <Field label={t('redirects.to')}>
            {(control) => (
              <Input
                {...control}
                required
                placeholder="/new-page"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="min-w-32">
          <Field label={t('redirects.status')}>
            {(control) => (
              <Select
                {...control}
                value={status}
                onChange={(event) => setStatus(event.target.value as '301' | '302')}
              >
                <option value="301">{t('redirects.permanent')}</option>
                <option value="302">{t('redirects.temporary')}</option>
              </Select>
            )}
          </Field>
        </div>
        <Button type="submit" disabled={saving}>
          {t('redirects.create')}
        </Button>
      </form>

      {loading && <p>{t('common.loading')}</p>}

      {!loading && (
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
              {redirects.map((redirect) => (
                <TableRow key={redirect.id}>
                  <TableCell className="font-mono text-sm">{redirect.from}</TableCell>
                  <TableCell className="font-mono text-sm">{redirect.to}</TableCell>
                  <TableCell>{redirect.status}</TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm" onClick={() => void remove(redirect)}>
                      {t('redirects.delete')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {redirects.length === 0 && (
                <TableEmpty colSpan={4}>{t('redirects.empty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
