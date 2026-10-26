import type { TFunction } from 'i18next'
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
  updateApiKey,
} from '../api/api-keys-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { roleLabel } from '../lib/role-label.js'
import { canPerform, grantsForRole, knownRoleNames } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary, SchemaDocument } from '../schema/types.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import {
  Button,
  CopyButton,
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
import { ACTION_KEY } from './roles.js'
import { RoleCheckboxList, RoleGrantsSummary } from './users.js'

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
/** Mirrors `DEFAULT_RATE_LIMIT_PER_MINUTE` in `@cogenta/auth`'s `api-keys.ts`, by hand, same reasoning as the two constants above — only used to pre-fill the edit form's rate limit field as blank ("use the default") rather than showing a number the admin never actually set. */
const DEFAULT_RATE_LIMIT_PER_MINUTE = 600

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

/** What one role actually unlocks on this site, in plain language — for the scope disclosure. */
function roleDetail(
  t: TFunction,
  role: string,
  schema: SchemaDocument | null,
  locale: string,
): string {
  if (schema === null) return roleLabel(t, role)
  const grants = grantsForRole(role, schema, locale)
  if (grants.length === 0) return `${roleLabel(t, role)} : ${t('users.roleGrantsNone')}`
  return `${roleLabel(t, role)} : ${grants
    .map(
      (grant) =>
        `${grant.label} (${grant.actions.map((action) => t(ACTION_KEY[action])).join(', ')})`,
    )
    .join(' — ')}`
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
  const { t, i18n } = useTranslation()
  const formatWhen = useDateTimeFormatter()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const schemaState = useSchema()
  const schema = schemaState.status === 'ready' ? schemaState.schema : null
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
  const [newScope, setNewScope] = useState<ReadonlySet<string>>(() => new Set())
  const [newNameError, setNewNameError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [newExpiry, setNewExpiry] = useState<ExpiryChoice>('90d')
  const [newRateLimit, setNewRateLimit] = useState('')
  const [created, setCreated] = useState<CreatedApiKey | null>(null)

  const [revoking, setRevoking] = useState<AdminApiKey | null>(null)
  const [rotating, setRotating] = useState<AdminApiKey | null>(null)
  const [graceHours, setGraceHours] = useState<GraceHours>(24)
  const [rotated, setRotated] = useState<RotatedApiKey | null>(null)
  const [rotatedGraceHours, setRotatedGraceHours] = useState<GraceHours>(24)

  const [purging, setPurging] = useState<AdminApiKey | null>(null)
  const [recovering, setRecovering] = useState<AdminApiKey | null>(null)
  const [recovered, setRecovered] = useState<CreatedApiKey | null>(null)

  const [editing, setEditing] = useState<AdminApiKey | null>(null)
  const [editName, setEditName] = useState('')
  const [editScope, setEditScope] = useState<ReadonlySet<string>>(() => new Set())
  const [editRateLimit, setEditRateLimit] = useState('')

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

  /**
   * The roles a key can be scoped to: those this site's schema names, plus any
   * a key already holds (so editing a key never silently drops a role the list
   * would not offer). `admin` comes last — a key with it can do anything.
   */
  const offeredRoles = useMemo(() => {
    const names = new Set<string>([
      ...(schema === null ? [] : knownRoleNames(schema)),
      ...keys.flatMap((key) => key.scope),
    ])
    names.delete('admin')
    return [...[...names].sort(), 'admin']
  }, [schema, keys])

  function toggleScope(set: ReadonlySet<string>, role: string): Set<string> {
    const next = new Set(set)
    if (next.has(role)) next.delete(role)
    else next.add(role)
    return next
  }

  function parseRateLimit(raw: string): number | null | 'invalid' {
    if (raw.trim() === '') return null
    const value = Number(raw)
    return Number.isInteger(value) && value > 0 ? value : 'invalid'
  }

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setCreateError(null)
    setNewNameError(null)
    const name = newName.trim()
    if (name === '') {
      setNewNameError(t('apiKeys.nameRequired'))
      return
    }
    if (keys.some((key) => key.revokedAt === null && key.name.trim() === name)) {
      setNewNameError(t('apiKeys.nameDuplicate'))
      return
    }
    if (newScope.size === 0) {
      setCreateError(t('apiKeys.scopeNone'))
      return
    }
    const rateLimitPerMinute = parseRateLimit(newRateLimit)
    if (rateLimitPerMinute === 'invalid') {
      setCreateError(t('apiKeys.rateLimitInvalid'))
      return
    }
    try {
      const result = await createApiKey(token, {
        name,
        scope: [...newScope],
        ...expiryFieldsFor(newExpiry),
        ...(rateLimitPerMinute === null ? {} : { rateLimitPerMinute }),
      })
      setCreated(result)
      setCreating(false)
      setNewName('')
      setNewScope(new Set())
      setNewExpiry('90d')
      setNewRateLimit('')
      await load()
    } catch (caught) {
      setCreateError(caught instanceof ApiError ? caught.message : t('apiKeys.createError'))
    }
  }

  function startEdit(key: AdminApiKey): void {
    setEditing(key)
    setEditName(key.name)
    setEditScope(new Set(key.scope))
    setEditError(null)
    setEditRateLimit(
      key.rateLimitPerMinute === DEFAULT_RATE_LIMIT_PER_MINUTE
        ? ''
        : String(key.rateLimitPerMinute),
    )
  }

  async function submitEdit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    setEditError(null)
    const name = editName.trim()
    if (name === '') {
      setEditError(t('apiKeys.nameRequired'))
      return
    }
    if (editScope.size === 0) {
      setEditError(t('apiKeys.scopeNone'))
      return
    }
    const rateLimitPerMinute = parseRateLimit(editRateLimit)
    if (rateLimitPerMinute === 'invalid') {
      setEditError(t('apiKeys.rateLimitInvalid'))
      return
    }
    try {
      await updateApiKey(token, editing.id, {
        name,
        scope: [...editScope],
        rateLimitPerMinute,
      })
      setActionNotice(t('apiKeys.savedDone', { name }))
      setEditing(null)
      await load()
    } catch (caught) {
      setEditError(caught instanceof ApiError ? caught.message : t('apiKeys.editError'))
    }
  }

  async function confirmRevoke(): Promise<void> {
    if (token === null || revoking === null) return
    setActionError(null)
    try {
      await revokeApiKey(token, revoking.id)
      setActionNotice(t('apiKeys.revokedDone', { name: revoking.name }))
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
      setRotatedGraceHours(graceHours)
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
      setActionNotice(t('apiKeys.purgedDone', { name: purging.name }))
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
    if (key.revokedAt !== null) return '—'
    if (key.expiresAt === null) return t('apiKeys.neverExpires')
    const days = daysUntil(key.expiresAt)
    if (days <= 0) return t('apiKeys.expired')
    return key.supersededBy !== null
      ? t('apiKeys.gracePeriodUntil', { count: days })
      : t('apiKeys.expiresInDays', { count: days })
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
          <SecretLine
            value={created.key}
            copyLabel={t('apiKeys.copyKey')}
            copiedLabel={t('apiKeys.copied')}
          />
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
          <p>{t('apiKeys.rotatedBody', { count: rotatedGraceHours })}</p>
          <SecretLine
            value={rotated.issued.key}
            copyLabel={t('apiKeys.copyKey')}
            copiedLabel={t('apiKeys.copied')}
          />
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
          <SecretLine
            value={recovered.key}
            copyLabel={t('apiKeys.copyKey')}
            copiedLabel={t('apiKeys.copied')}
          />
          <p className="mt-2 font-semibold">{t('apiKeys.createdWarning')}</p>
        </Notice>
      )}

      {actionNotice !== null && (
        <Notice
          tone="success"
          live="polite"
          onDismiss={() => setActionNotice(null)}
          dismissLabel={t('apiKeys.close')}
        >
          <p>{actionNotice}</p>
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
        <TableRoot label={t('apiKeys.tableLabel')} stacked>
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
                    <TableCell stack="heading">{key.name}</TableCell>
                    <TableCell className="font-mono text-sm" label={t('apiKeys.prefixColumn')}>
                      {key.prefix}…
                    </TableCell>
                    <TableCell label={t('apiKeys.scopeColumn')}>
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
                        <summary className="cursor-pointer text-sm">
                          {key.scope.map((role) => roleLabel(t, role)).join(', ')}
                        </summary>
                        <ul className="m-0 mt-1 list-none p-0 text-xs text-muted-foreground">
                          {key.scope.map((role) => (
                            <li key={role}>{roleDetail(t, role, schema, i18n.language)}</li>
                          ))}
                        </ul>
                      </details>
                      {writeRoles.length > 0 && (
                        <p className="mt-1 text-xs text-warning">
                          {t('apiKeys.scopeWriteWarning', {
                            roles: writeRoles.map((role) => roleLabel(t, role)).join(', '),
                          })}
                        </p>
                      )}
                    </TableCell>
                    <TableCell label={t('apiKeys.createdColumn')}>
                      {formatWhen(key.createdAt)}
                    </TableCell>
                    <TableCell label={t('apiKeys.expiresColumn')}>{expiryLabel(key)}</TableCell>
                    <TableCell label={t('apiKeys.usageColumn')}>
                      {t('apiKeys.usageSummary', {
                        last7: key.usage.last7Days,
                        last30: key.usage.last30Days,
                      })}
                    </TableCell>
                    <TableCell label={t('apiKeys.lastUsedColumn')}>
                      {key.lastUsedAt === null ? t('apiKeys.never') : formatWhen(key.lastUsedAt)}
                      {hygiene !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">{hygiene}</p>
                      )}
                    </TableCell>
                    <TableCell label={t('apiKeys.statusColumn')}>{statusOf(key)}</TableCell>
                    <TableCell stack="actions">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!canManage}
                          aria-label={t('apiKeys.editKey', { name: key.name })}
                          onClick={() => startEdit(key)}
                        >
                          {t('apiKeys.editShort')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!canManage}
                          aria-label={t('apiKeys.rotateKey', { name: key.name })}
                          onClick={() => setRotating(key)}
                        >
                          {t('apiKeys.rotateShort')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={key.revokedAt !== null}
                          aria-label={t('apiKeys.revokeKey', { name: key.name })}
                          onClick={() => setRevoking(key)}
                        >
                          {t('apiKeys.revokeShort')}
                        </Button>
                        {key.revokedAt !== null && canRecover(key) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={t('apiKeys.recoverKey', { name: key.name })}
                            onClick={() => setRecovering(key)}
                          >
                            {t('apiKeys.recoverShort')}
                          </Button>
                        )}
                        {key.revokedAt !== null &&
                          (purgeEligibleInDays(key) === 0 ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              aria-label={t('apiKeys.purgeKey', { name: key.name })}
                              onClick={() => setPurging(key)}
                            >
                              {t('apiKeys.purgeShort')}
                            </Button>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {t('apiKeys.purgeIn', { count: purgeEligibleInDays(key) ?? 0 })}
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
        onOpenChange={(open) => {
          setCreating(open)
          if (!open) {
            setCreateError(null)
            setNewNameError(null)
          }
        }}
        title={t('apiKeys.newHeading')}
        description={t('apiKeys.newDescription')}
        closeLabel={t('apiKeys.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="create-api-key-form">
              {t('apiKeys.createButton')}
            </Button>
          </>
        }
      >
        <form
          id="create-api-key-form"
          noValidate
          onSubmit={submitCreate}
          className="flex flex-col gap-4"
        >
          {createError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{createError}</p>
            </Notice>
          )}
          <Field
            label={t('apiKeys.nameLabel')}
            description={t('apiKeys.nameHint')}
            error={newNameError}
          >
            {(control) => (
              <Input
                {...control}
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            )}
          </Field>
          <RoleCheckboxList
            idPrefix="new-key-scope"
            legend={t('apiKeys.scopeLabel')}
            description={t('apiKeys.scopeHint')}
            roles={offeredRoles}
            selected={newScope}
            onToggle={(role) => setNewScope((current) => toggleScope(current, role))}
          />
          <RoleGrantsSummary roles={[...newScope]} schema={schema} locale={i18n.language} />
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
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={t('apiKeys.editHeading', { name: editing?.name ?? '' })}
        description={t('apiKeys.editDescription')}
        closeLabel={t('apiKeys.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="edit-api-key-form">
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form
          id="edit-api-key-form"
          noValidate
          onSubmit={submitEdit}
          className="flex flex-col gap-4"
        >
          {editError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{editError}</p>
            </Notice>
          )}
          <Field label={t('apiKeys.nameLabel')} description={t('apiKeys.nameHint')}>
            {(control) => (
              <Input
                {...control}
                required
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            )}
          </Field>
          <RoleCheckboxList
            idPrefix="edit-key-scope"
            legend={t('apiKeys.scopeLabel')}
            description={t('apiKeys.scopeHint')}
            roles={offeredRoles}
            selected={editScope}
            onToggle={(role) => setEditScope((current) => toggleScope(current, role))}
          />
          <RoleGrantsSummary roles={[...editScope]} schema={schema} locale={i18n.language} />
          <Field label={t('apiKeys.rateLimitLabel')} description={t('apiKeys.rateLimitHint')}>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={1}
                placeholder={t('apiKeys.rateLimitPlaceholder')}
                value={editRateLimit}
                onChange={(event) => setEditRateLimit(event.target.value)}
              />
            )}
          </Field>
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

/** A secret shown once: monospaced, selectable in one click, with a copy button. */
function SecretLine({
  value,
  copyLabel,
  copiedLabel,
}: {
  readonly value: string
  readonly copyLabel: string
  readonly copiedLabel: string
}): JSX.Element {
  return (
    <div className="my-2 flex flex-wrap items-center gap-3">
      <code className="min-w-0 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-sm break-all select-all">
        {value}
      </code>
      <CopyButton value={value} label={copyLabel} copiedLabel={copiedLabel} />
    </div>
  )
}
