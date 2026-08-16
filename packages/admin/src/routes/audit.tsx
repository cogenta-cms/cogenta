import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type AuditEntry, listAuditEntries, verifyAuditLog } from '../api/audit-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Field,
  Input,
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

/** L2 task 14: a consultable, filterable view over `@cogenta/auth`'s hash-chained audit log — read-only, `admin` only (the API refuses everyone else with 403). */
export function AuditRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [actorId, setActorId] = useState('')
  const [action, setAction] = useState('')
  const [collection, setCollection] = useState('')
  const [entries, setEntries] = useState<readonly AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const found = await listAuditEntries(token, {
        ...(actorId === '' ? {} : { actorId }),
        ...(action === '' ? {} : { action }),
        ...(collection === '' ? {} : { collection }),
      })
      setEntries(found)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('audit.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, actorId, action, collection, t])

  useEffect(() => {
    void load()
  }, [load])

  function submitFilters(event: FormEvent): void {
    event.preventDefault()
    void load()
  }

  async function verify(): Promise<void> {
    if (token === null) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const result = await verifyAuditLog(token)
      setVerifyResult(result.ok ? t('audit.verifyOk') : t('audit.verifyBroken'))
    } catch (caught) {
      setVerifyResult(caught instanceof ApiError ? caught.message : t('audit.verifyError'))
    } finally {
      setVerifying(false)
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
        <Button type="submit">{t('audit.filter')}</Button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={verifying} onClick={() => void verify()}>
          {verifying ? t('audit.verifying') : t('audit.verify')}
        </Button>
        {verifyResult !== null && <span role="status">{verifyResult}</span>}
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
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.at}</TableCell>
                  <TableCell>{entry.actorId ?? '—'}</TableCell>
                  <TableCell>{entry.actorRoles.join(', ')}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>{entry.collection ?? '—'}</TableCell>
                  <TableCell>{entry.entryId ?? '—'}</TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && <TableEmpty colSpan={6}>{t('audit.noEntries')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
