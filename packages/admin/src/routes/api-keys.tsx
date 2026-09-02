import { type FormEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AdminApiKey,
  type CreatedApiKey,
  createApiKey,
  listApiKeysPage,
  purgeApiKey,
  type RotatedApiKey,
  recoverApiKey,
  revokeApiKey,
  rotateApiKey,
} from '../api/api-keys-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'
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

/**
 * L13 task 8 — machine-to-machine bearer credentials, managed from the admin
 * instead of never existing at all. Expiry defaults, rotation, the per-key
 * request quota and usage/hygiene added by fiche 20.
 *
 * `admin` only, same courtesy-plus-server-check split as `UsersRoute`: this
 * screen hides what a non-admin cannot do, but the 403 the router produces is
 * what actually stops them (R4).
 *
 * The one rule that shapes every line below: the raw key is a value this
 * component holds **only** in `created` and `rotated.issued`, set once by
 * `submitCreate`/`confirmRotate` from the server's own response, and cleared
 * the moment its notice is dismissed. `listApiKeys` never returns it — the
 * list only ever renders a `prefix` — so there is no code path here that
 * could show it twice. Read this comment again before adding a field to the
 * list row: it must never widen to something that could carry `key`.
 */

const WRITE_ACTIONS = ['create', 'update', 'delete', 'publish'] as const
const ALL_ACTIONS = ['read', ...WRITE_ACTIONS] as const
const EXPIRY_CHOICES = ['30d', '90d', '1y', 'never'] as const
type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]
const GRACE_CHOICES = [1, 24, 24 * 7] as const
type GraceHours = (typeof GRACE_CHOICES)[number]
const UNUSED_WARNING_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 25
/**
 * Fiche 62 tasks 2-3 — mirrors `MIN_PURGE_AFTER_REVOKED_DAYS`/
 * `RECOVERY_WINDOW_MS` in `@cogenta/auth`'s `api-keys.ts`, by hand: this
 * package has no dependency on that one (REST only), so these are only ever
 * used to decide which button this screen *offers* — the server is the one
 * and only authority on whether an action actually succeeds.
 */
const MIN_PURGE_AFTER_REVOKED_DAYS = 30
const RECOVERY_WINDOW_HOURS = 24

function expiryFieldsFor(choice: ExpiryChoice): { expiresAt?: string; neverExpires?: boolean } {
  if (choice === 'never') return { neverExpires: true }
  const days = choice === '30d' ? 30 : choice === '90d' ? 90 : 365
  return { expiresAt: new Date(Date.now() + days * DAY_MS).toISOString() }
}

/** Roles this scope grants that also unlock at least one write action somewhere on this site. */
function writeGrantingRoles(
  scope: readonly string[],
  collections: readonly CollectionSummary[],
): readonly string[] {
  return scope.filter((role) =>
    collections.some((collection) =>
      WRITE_ACTIONS.some((action) => canPerform(action, collection, [role])),
    ),
  )
}

/** What one role actually unlocks on this site, in plain language — for the hover detail. */
function roleDetail(role: string, collections: readonly CollectionSummary[]): string {
  const grants = collections
    .map((collection) => {
      const actions = ALL_ACTIONS.filter((action) => canPerform(action, collection, [role]))
      return actions.length === 0 ? null : `${collection.labels.plural}: ${actions.join(', ')}`
    })
    .filter((line): line is string => line !== null)
  return grants.length === 0 ? `${role}: no permission on this site` : grants.join(' — ')
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS)
}

/** `null` while not (yet) eligible; `0` once a revoked key can be purged. */
function purgeEligibleInDays(key: AdminApiKey): number | null {
  if (key.revokedAt === null) return null
  const revokedDaysAgo = (Date.now() - new Date(key.revokedAt).getTime()) / DAY_MS
  return Math.max(Math.ceil(MIN_PURGE_AFTER_REVOKED_DAYS - revokedDaysAgo), 0)
}

/** Fiche 62 task 3, decision (b): only within the recovery window, and only for a revoked key. */
function canRecover(key: AdminApiKey): boolean {
  if (key.revokedAt === null) return false
  const revokedHoursAgo = (Date.now() - new Date(key.revokedAt).getTime()) / (60 * 60 * 1000)
  return revokedHoursAgo <= RECOVERY_WINDOW_HOURS
}

export function ApiKeysRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const schemaState = useSchema()
  const collections = useMemo(
    () => (schemaState.status === 'ready' ? schemaState.schema.collections : []),
    [schemaState],
  )

  const [keys, setKeys] = useState<readonly AdminApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState('viewer')
  const [newExpiry, setNewExpiry] = useState<ExpiryChoice>('90d')
  const [newRateLimit, setNewRateLimit] = useState('')
  const [created, setCreated] = useState<CreatedApiKey | null>(null)

  const [revoking, setRevoking] = useState<AdminApiKey | null>(null)
  const [rotating, setRotating] = useState<AdminApiKey | null>(null)
  const [graceHours, setGraceHours] = useState<GraceHours>(24)
  const [rotated, setRotated] = useState<RotatedApiKey | null>(null)

  const [purging, setPurging] = useState<AdminApiKey | null>(null)
  const [recovering, setRecovering] = useState<AdminApiKey | null>(null)
  const [recovered, setRecovered] = useState<CreatedApiKey | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const page = await listApiKeysPage(token, { limit: PAGE_SIZE })
      setKeys(page.keys)
      setHasMore(page.hasMore)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('apiKeys.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore(): Promise<void> {
    if (token === null) return
    setLoadingMore(true)
    try {
      const page = await listApiKeysPage(token, { limit: PAGE_SIZE, offset: keys.length })
      setKeys((current) => [...current, ...page.keys])
      setHasMore(page.hasMore)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('apiKeys.loadError'))
    } finally {
      setLoadingMore(false)
    }
  }

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
      const rateLimitPerMinute =
        newRateLimit.trim() === '' ? undefined : Number.parseInt(newRateLimit, 10)
      const result = await createApiKey(token, {
        name: newName,
        scope: parseScope(newScope),
        ...expiryFieldsFor(newExpiry),
        ...(rateLimitPerMinute === undefined ? {} : { rateLimitPerMinute }),
      })
      setCreated(result)
      setCreating(false)
      setNewName('')
      setNewScope('viewer')
      setNewExpiry('90d')
      setNewRateLimit('')
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('apiKeys.createError'))
    }
  }

  async function confirmRevoke(): Promise<void> {
    if (token === null || revoking === null) return
    setActionError(null)
    try {
      await revokeApiKey(token, revoking.id)
      setRevoking(null)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('apiKeys.revokeError'))
    }
  }

  async function confirmRotate(): Promise<void> {
    if (token === null || rotating === null) return
    setActionError(null)
    try {
      const result = await rotateApiKey(token, rotating.id, graceHours)
      setRotated(result)
      setRotating(null)
      setGraceHours(24)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('apiKeys.rotateError'))
    }
  }

  async function confirmPurge(): Promise<void> {
    if (token === null || purging === null) return
    setActionError(null)
    try {
      await purgeApiKey(token, purging.id)
      setPurging(null)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('apiKeys.purgeError'))
    }
  }

  async function confirmRecover(): Promise<void> {
    if (token === null || recovering === null) return
    setActionError(null)
    try {
      const result = await recoverApiKey(token, recovering.id)
      setRecovered(result)
      setRecovering(null)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('apiKeys.recoverError'))
    }
  }

  function statusOf(key: AdminApiKey): string {
    if (key.revokedAt !== null) return t('apiKeys.revoked')
    if (key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now()) {
      return t('apiKeys.expired')
    }
    if (key.supersededBy !== null) return t('apiKeys.onGracePeriod')
    return t('apiKeys.active')
  }

  function expiryLabel(key: AdminApiKey): string {
    if (key.expiresAt === null) return t('apiKeys.neverExpires')
    const days = daysUntil(key.expiresAt)
    if (days <= 0) return t('apiKeys.expired')
    return key.supersededBy !== null
      ? t('apiKeys.gracePeriodUntil', { days })
      : t('apiKeys.expiresInDays', { days })
  }

  function hygieneNote(key: AdminApiKey): string | null {
    if (key.revokedAt !== null) return null
    if (key.lastUsedAt === null) return t('apiKeys.neverUsed')
    const idleDays = Math.floor((Date.now() - new Date(key.lastUsedAt).getTime()) / DAY_MS)
    if (idleDays >= UNUSED_WARNING_DAYS) return t('apiKeys.unusedFor', { days: idleDays })
    return null
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
          <h1 id="api-keys-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
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

      {rotated !== null && (
        <Notice
          tone="success"
          live="assertive"
          title={t('apiKeys.rotatedTitle', { name: rotated.issued.name })}
          onDismiss={() => setRotated(null)}
          dismissLabel={t('apiKeys.createdDismiss')}
        >
          <p>{t('apiKeys.rotatedBody', { hours: graceHours })}</p>
          <p className="font-mono text-sm break-all">{rotated.issued.key}</p>
          <p className="mt-2 font-semibold">{t('apiKeys.createdWarning')}</p>
        </Notice>
      )}

      {recovered !== null && (
        <Notice
          tone="success"
          live="assertive"
          title={t('apiKeys.recoveredTitle', { name: recovered.name })}
          onDismiss={() => setRecovered(null)}
          dismissLabel={t('apiKeys.createdDismiss')}
        >
          <p>{t('apiKeys.recoveredBody')}</p>
          <p className="font-mono text-sm break-all">{recovered.key}</p>
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
                <TableHeader>{t('apiKeys.expiresColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.usageColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.lastUsedColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.statusColumn')}</TableHeader>
                <TableHeader>{t('apiKeys.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map((key) => {
                const writeRoles = writeGrantingRoles(key.scope, collections)
                const hygiene = hygieneNote(key)
                const canManage = key.revokedAt === null && key.supersededBy === null
                return (
                  <TableRow key={key.id}>
                    <TableCell>{key.name}</TableCell>
                    <TableCell className="font-mono text-sm">{key.prefix}…</TableCell>
                    <TableCell>
                      {/* T09-03 — the scope detail used to live only in a
                          `title=` hover, unreachable by keyboard or on a
                          touch screen. A native `<details>` disclosure, the
                          same accessible pattern already used elsewhere in
                          this admin (`collection-list.tsx`'s column picker,
                          `entry-edit.tsx`'s history/translations sections):
                          keyboard- and screen-reader-correct with no ARIA to
                          get wrong, and no new design-system component for
                          a single use (R9). `roleDetail` itself is
                          unchanged — only its presentation moved. */}
                      <details>
                        <summary className="cursor-pointer text-sm">{key.scope.join(', ')}</summary>
                        <ul className="m-0 mt-1 list-none p-0 text-xs text-muted-foreground">
                          {key.scope.map((role) => (
                            <li key={role}>{roleDetail(role, collections)}</li>
                          ))}
                        </ul>
                      </details>
                      {writeRoles.length > 0 && (
                        <p className="mt-1 text-xs text-warning">
                          {t('apiKeys.scopeWriteWarning', { roles: writeRoles.join(', ') })}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{key.createdAt}</TableCell>
                    <TableCell>{expiryLabel(key)}</TableCell>
                    <TableCell>
                      {t('apiKeys.usageSummary', {
                        last7: key.usage.last7Days,
                        last30: key.usage.last30Days,
                      })}
                    </TableCell>
                    <TableCell>
                      {key.lastUsedAt ?? t('apiKeys.never')}
                      {hygiene !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">{hygiene}</p>
                      )}
                    </TableCell>
                    <TableCell>{statusOf(key)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!canManage}
                          onClick={() => setRotating(key)}
                        >
                          {t('apiKeys.rotateKey', { name: key.name })}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={key.revokedAt !== null}
                          onClick={() => setRevoking(key)}
                        >
                          {t('apiKeys.revokeKey', { name: key.name })}
                        </Button>
                        {key.revokedAt !== null && canRecover(key) && (
                          <Button variant="secondary" size="sm" onClick={() => setRecovering(key)}>
                            {t('apiKeys.recoverKey', { name: key.name })}
                          </Button>
                        )}
                        {key.revokedAt !== null &&
                          (purgeEligibleInDays(key) === 0 ? (
                            <Button variant="destructive" size="sm" onClick={() => setPurging(key)}>
                              {t('apiKeys.purgeKey', { name: key.name })}
                            </Button>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {t('apiKeys.purgeIn', { days: purgeEligibleInDays(key) })}
                            </p>
                          ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {keys.length === 0 && <TableEmpty colSpan={9}>{t('apiKeys.empty')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {!loading && (
        <Pagination
          variant="cursor"
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={() => void loadMore()}
          loadMoreLabel={t('apiKeys.loadMore')}
          loadingLabel={t('common.loading')}
        />
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
          <Field
            label={t('apiKeys.expiryLabel')}
            description={
              newExpiry === 'never' ? t('apiKeys.expiryNeverWarning') : t('apiKeys.expiryHint')
            }
          >
            {(control) => (
              <Select
                {...control}
                value={newExpiry}
                onChange={(event) => setNewExpiry(event.target.value as ExpiryChoice)}
              >
                <option value="30d">{t('apiKeys.expiry30d')}</option>
                <option value="90d">{t('apiKeys.expiry90d')}</option>
                <option value="1y">{t('apiKeys.expiry1y')}</option>
                <option value="never">{t('apiKeys.expiryNever')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('apiKeys.rateLimitLabel')} description={t('apiKeys.rateLimitHint')}>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={1}
                placeholder={t('apiKeys.rateLimitPlaceholder')}
                value={newRateLimit}
                onChange={(event) => setNewRateLimit(event.target.value)}
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

      <Modal
        open={rotating !== null}
        onOpenChange={(open) => {
          if (!open) setRotating(null)
        }}
        title={t('apiKeys.rotateHeading', { name: rotating?.name ?? '' })}
        description={t('apiKeys.rotateDescription')}
        closeLabel={t('apiKeys.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRotating(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void confirmRotate()}>{t('apiKeys.rotateButton')}</Button>
          </>
        }
      >
        <Field label={t('apiKeys.graceLabel')} description={t('apiKeys.graceHint')}>
          {(control) => (
            <Select
              {...control}
              value={String(graceHours)}
              onChange={(event) => setGraceHours(Number(event.target.value) as GraceHours)}
            >
              <option value="1">{t('apiKeys.grace1h')}</option>
              <option value="24">{t('apiKeys.grace24h')}</option>
              <option value={String(24 * 7)}>{t('apiKeys.grace7d')}</option>
            </Select>
          )}
        </Field>
      </Modal>

      <Modal
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title={t('apiKeys.confirmRevokeTitle', { name: revoking?.name ?? '' })}
        closeLabel={t('apiKeys.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevoking(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmRevoke()}>
              {t('apiKeys.confirmRevokeButton')}
            </Button>
          </>
        }
      >
        <p>{t('apiKeys.confirmRevoke')}</p>
      </Modal>

      <Modal
        open={recovering !== null}
        onOpenChange={(open) => {
          if (!open) setRecovering(null)
        }}
        title={t('apiKeys.recoverHeading', { name: recovering?.name ?? '' })}
        description={t('apiKeys.recoverDescription')}
        closeLabel={t('apiKeys.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecovering(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void confirmRecover()}>{t('apiKeys.recoverButton')}</Button>
          </>
        }
      >
        <p>{t('apiKeys.recoverWarning')}</p>
      </Modal>

      <Modal
        open={purging !== null}
        onOpenChange={(open) => {
          if (!open) setPurging(null)
        }}
        title={t('apiKeys.confirmPurgeTitle', { name: purging?.name ?? '' })}
        closeLabel={t('apiKeys.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPurging(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmPurge()}>
              {t('apiKeys.confirmPurgeButton')}
            </Button>
          </>
        }
      >
        <p>{t('apiKeys.confirmPurge')}</p>
      </Modal>
    </section>
  )
}
