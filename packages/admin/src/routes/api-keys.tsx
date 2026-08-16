import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AdminApiKey,
  type CreatedApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../api/api-keys-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Field,
  Input,
  Modal,
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
 * L13 task 8 — machine-to-machine bearer credentials, managed from the admin
 * instead of never existing at all.
 *
 * `admin` only, same courtesy-plus-server-check split as `UsersRoute`: this
 * screen hides what a non-admin cannot do, but the 403 the router produces is
 * what actually stops them (R4).
 *
 * The one rule that shapes every line below: the raw key is a value this
 * component holds **only** in `created`, set once by `submitCreate` from the
 * server's own creation response, and cleared the moment its notice is
 * dismissed. `listApiKeys` never returns it — the list only ever renders a
 * `prefix` — so there is no code path here that could show it twice.
 */
export function ApiKeysRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [keys, setKeys] = useState<readonly AdminApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState('viewer')
  const [created, setCreated] = useState<CreatedApiKey | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setKeys(await listApiKeys(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('apiKeys.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  function parseScope(raw: string): string[] {
    return raw
      .split(',')
      .map((role) => role.trim())
      .filter((role) => role.length > 0)
  }

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setActionError(null)
    try {
      const result = await createApiKey(token, { name: newName, scope: parseScope(newScope) })
      setCreated(result)
      setCreating(false)
      setNewName('')
      setNewScope('viewer')
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('apiKeys.createError'))
    }
  }

  async function revoke(key: AdminApiKey): Promise<void> {
    if (token === null) return
    if (!globalThis.confirm(t('apiKeys.confirmRevoke'))) return
    setActionError(null)
    try {
      await revokeApiKey(token, key.id)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('apiKeys.revokeError'))
    }
  }

  function statusOf(key: AdminApiKey): string {
    if (key.revokedAt !== null) return t('apiKeys.revoked')
    if (key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now()) {
      return t('apiKeys.expired')
    }
    return t('apiKeys.active')
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="api-keys-heading">
        <h1 id="api-keys-heading">{t('apiKeys.heading')}</h1>
        <p role="alert">{t('apiKeys.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="api-keys-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="api-keys-heading" className="m-0 text-xl leading-7 font-semibold">
            {t('apiKeys.heading')}
          </h1>
          <p className="mt-1 text-sm">{t('apiKeys.intro')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t('apiKeys.newButton')}</Button>
      </div>

      {created !== null && (
        <Notice
          tone="success"
          live="assertive"
          title={t('apiKeys.createdTitle', { name: created.name })}
          onDismiss={() => setCreated(null)}
          dismissLabel={t('apiKeys.createdDismiss')}
        >
          <p>{t('apiKeys.createdBody')}</p>
          <p className="font-mono text-sm break-all">{created.key}</p>
          <p className="mt-2 font-semibold">{t('apiKeys.createdWarning')}</p>
        </Notice>
      )}

      {actionError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{actionError}</p>
        </Notice>
      )}

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <TableRoot label={t('apiKeys.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('apiKeys.nameColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.prefixColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.scopeColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.createdColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.lastUsedColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.statusColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.name}</TableCell>
                  <TableCell className="font-mono text-sm">{key.prefix}…</TableCell>
                  <TableCell>{key.scope.join(', ')}</TableCell>
                  <TableCell>{key.createdAt}</TableCell>
                  <TableCell>{key.lastUsedAt ?? t('apiKeys.never')}</TableCell>
                  <TableCell>{statusOf(key)}</TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={key.revokedAt !== null}
                      onClick={() => void revoke(key)}
                    >
                      {t('apiKeys.revokeKey', { name: key.name })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {keys.length === 0 && <TableEmpty colSpan={7}>{t('apiKeys.empty')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={t('apiKeys.newHeading')}
        description={t('apiKeys.newDescription')}
        closeLabel={t('apiKeys.close')}
      >
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <Field label={t('apiKeys.nameLabel')} description={t('apiKeys.nameHint')}>
            {(control) => (
              <Input
                {...control}
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('apiKeys.scopeLabel')} description={t('apiKeys.scopeHint')}>
            {(control) => (
              <Input
                {...control}
                required
                value={newScope}
                onChange={(event) => setNewScope(event.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('apiKeys.createButton')}</Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
