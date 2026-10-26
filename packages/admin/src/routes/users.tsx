import { type FormEvent, type JSX, type ReactNode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ApiErrorDescription, describeApiError } from '../api/describe-error.js'
import {
  type AdminUser,
  anonymizeUser,
  bulkUpdateUsers,
  type CreatedUser,
  cancelInvitation,
  createUser,
  fetchPersonalDataExport,
  listUserSessions,
  listUsersPage,
  resendInvitation,
  revokeUserSession,
  type UserSession,
  updateUser,
} from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import { roleLabel } from '../lib/role-label.js'
import { sessionDeviceLabel } from '../lib/session-labels.js'
import { useLocalPagination } from '../lib/use-local-pagination.js'
import { grantsForRole, knownRoleNames } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { SchemaDocument } from '../schema/types.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
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

/**
 * The two role names every site is offered, whether or not any account holds
 * them yet: `admin` and `editor` are the vocabulary the shipped site models
 * (and the admin itself) are written around.
 *
 * This is a **UX convention, not a server constraint** — contract A still
 * only knows five permission actions (`read`/`create`/`update`/`delete`/
 * `publish`) per collection, and a role is, as far as the server is
 * concerned, an arbitrary string a collection's `permissions` block happens
 * to name. The rest of the list is read off the site itself (see
 * `offeredRoles` below): offering `author` or `contributor` on a site where no
 * collection names them would hand out a role that grants nothing.
 */
const STANDARD_ROLES = ['admin', 'editor'] as const

const PAGE_SIZE = 25

/** A deliberately loose shape check — the server is the judge of a real address. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

const STATUS_TONE: Record<AdminUser['status'], 'success' | 'neutral' | 'info' | 'warning'> = {
  active: 'success',
  disabled: 'neutral',
  invited: 'info',
  anonymized: 'warning',
}

type SortChoice = 'createdAt:desc' | 'createdAt:asc' | 'lastSignInAt:desc' | 'lastSignInAt:asc'

function parseSortChoice(value: SortChoice): {
  sort: 'createdAt' | 'lastSignInAt'
  direction: 'asc' | 'desc'
} {
  const [sort, direction] = value.split(':') as ['createdAt' | 'lastSignInAt', 'asc' | 'desc']
  return { sort, direction }
}

/**
 * L11 task 3 — the account list — grown by fiche 17 into the full account
 * lifecycle: invite by email (with the R1 password fallback), search,
 * pagination and bulk actions, a dormant/MFA-recommended signal per row, and
 * irreversible anonymization.
 *
 * `admin` only, and the screen says so plainly to anyone else rather than
 * rendering controls that would 403 (the server refuses either way — this is
 * courtesy, not the check).
 *
 * Deleting an account outright is still not here for an `active`/`disabled`
 * one: it wrote content, and that content still has to be nameable in the
 * audit log. Anonymization (fiche 17 task 5) is the RGPD-erasure answer to
 * that — the id and every attribution survive, only the person's identity is
 * gone. Cancelling a still-pending invitation is a real, hard delete, and
 * that is fine: an `invited` account can never have signed in, so it can
 * never have authored anything either (`UserStore.delete`'s doc comment).
 */
export function UsersRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const formatWhen = useDateTimeFormatter()
  const auth = useAuth()
  const schemaState = useSchema()
  const schema = schemaState.status === 'ready' ? schemaState.schema : null
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const ownId = auth.state.status === 'authenticated' ? auth.state.user.id : null

  const [users, setUsers] = useState<readonly AdminUser[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [invitationEmailAvailable, setInvitationEmailAvailable] = useState(false)
  const [roleFilter, setRoleFilter] = useState('')
  const [rolesSeen, setRolesSeen] = useState<ReadonlySet<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [sortChoice, setSortChoice] = useState<SortChoice>('createdAt:desc')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<ApiErrorDescription | null>(null)
  const [actionError, setActionError] = useState<ApiErrorDescription | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())

  const [creating, setCreating] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRoleSet, setNewRoleSet] = useState<ReadonlySet<string>>(() => new Set(['editor']))
  const [newCustomRole, setNewCustomRole] = useState('')
  const [sendInvite, setSendInvite] = useState(true)
  const [newEmailError, setNewEmailError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<ApiErrorDescription | null>(null)
  const [created, setCreated] = useState<CreatedUser | null>(null)

  const [disabling, setDisabling] = useState<AdminUser | 'selection' | null>(null)
  const [disableBusy, setDisableBusy] = useState(false)

  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [editRoleSet, setEditRoleSet] = useState<ReadonlySet<string>>(() => new Set())
  const [editCustomRole, setEditCustomRole] = useState('')

  const [bulkRoleModal, setBulkRoleModal] = useState(false)
  const [bulkRoleSet, setBulkRoleSet] = useState<ReadonlySet<string>>(() => new Set())
  const [bulkCustomRole, setBulkCustomRole] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  const [sessionsOf, setSessionsOf] = useState<AdminUser | null>(null)
  const [sessions, setSessions] = useState<readonly UserSession[]>([])

  const [anonymizing, setAnonymizing] = useState<AdminUser | null>(null)
  const [anonymizeConfirm, setAnonymizeConfirm] = useState('')
  const [anonymizeError, setAnonymizeError] = useState<ApiErrorDescription | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    const { sort, direction } = parseSortChoice(sortChoice)
    try {
      const page = await listUsersPage(token, {
        role: roleFilter,
        q: submittedQuery,
        sort,
        direction,
        limit: PAGE_SIZE,
      })
      setUsers(page.users)
      setRolesSeen((current) => new Set([...current, ...page.users.flatMap((u) => u.roles)]))
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
      setInvitationEmailAvailable(page.invitationEmailAvailable)
      setSelected(new Set())
    } catch (caught) {
      setError(describeApiError(caught, t('users.loadError')))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, roleFilter, submittedQuery, sortChoice, t])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore(): Promise<void> {
    if (token === null || nextCursor === null) return
    setLoadingMore(true)
    const { sort, direction } = parseSortChoice(sortChoice)
    try {
      const page = await listUsersPage(token, {
        role: roleFilter,
        q: submittedQuery,
        sort,
        direction,
        limit: PAGE_SIZE,
        after: nextCursor,
      })
      setUsers((current) => [...current, ...page.users])
      setRolesSeen((current) => new Set([...current, ...page.users.flatMap((u) => u.roles)]))
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
    } catch (caught) {
      setError(describeApiError(caught, t('users.loadError')))
    } finally {
      setLoadingMore(false)
    }
  }

  /**
   * The roles this admin offers, for the checkbox lists and for the filter:
   * the two standard names, then every role this site's collections and
   * taxonomies actually name, then any role an account already holds (seen
   * across every page loaded so far, not only the rows on screen — a filter
   * that forgets its own options the moment it is applied is a trap).
   */
  const offeredRoles = [
    ...new Set([
      ...STANDARD_ROLES,
      ...(schema === null ? [] : knownRoleNames(schema)),
      ...rolesSeen,
    ]),
  ]

  function parseRoles(raw: string): string[] {
    return raw
      .split(',')
      .map((role) => role.trim())
      .filter((role) => role.length > 0)
  }

  function toggleRole(set: ReadonlySet<string>, role: string): Set<string> {
    const next = new Set(set)
    if (next.has(role)) next.delete(role)
    else next.add(role)
    return next
  }

  /** Checkboxes plus free-text custom roles, deduplicated into one list. */
  function combineRoles(set: ReadonlySet<string>, custom: string): string[] {
    return [...new Set([...set, ...parseRoles(custom)])]
  }

  function toggleSelected(id: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllOnPage(): void {
    setSelected((current) =>
      current.size === users.length ? new Set() : new Set(users.map((user) => user.id)),
    )
  }

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setCreateError(null)
    setNewEmailError(null)
    const email = newEmail.trim()
    if (email === '') {
      setNewEmailError(t('users.emailRequired'))
      return
    }
    if (!EMAIL_PATTERN.test(email)) {
      setNewEmailError(t('users.emailInvalid'))
      return
    }
    const roles = combineRoles(newRoleSet, newCustomRole)
    if (roles.length === 0) {
      setCreateError({ message: t('users.rolesNone') })
      return
    }
    try {
      const result = await createUser(token, {
        email,
        roles,
        invite: invitationEmailAvailable && sendInvite,
      })
      setCreated(result)
      setCreating(false)
      setNewEmail('')
      setNewRoleSet(new Set(['editor']))
      setNewCustomRole('')
      await load()
    } catch (caught) {
      setCreateError(describeApiError(caught, t('users.createError')))
    }
  }

  async function submitRoles(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    setActionError(null)
    const roles = combineRoles(editRoleSet, editCustomRole)
    if (roles.length === 0) {
      setActionError({ message: t('users.rolesNone') })
      return
    }
    try {
      await updateUser(token, editing.id, { roles })
      setActionNotice(t('users.rolesSaved', { email: editing.email }))
      setEditing(null)
      await load()
    } catch (caught) {
      setActionError(describeApiError(caught, t('users.updateError')))
    }
  }

  async function toggleStatus(user: AdminUser): Promise<void> {
    if (token === null) return
    setActionError(null)
    setActionNotice(null)
    const willDisable = user.status === 'active'
    try {
      await updateUser(token, user.id, { status: willDisable ? 'disabled' : 'active' })
      setActionNotice(
        t(willDisable ? 'users.disabledDone' : 'users.enabledDone', { email: user.email }),
      )
      await load()
    } catch (caught) {
      setActionError(describeApiError(caught, t('users.updateError')))
    }
  }

  /** Disabling is the one action here that shuts somebody out: it is confirmed first. */
  async function confirmDisable(): Promise<void> {
    if (disabling === null) return
    setDisableBusy(true)
    try {
      if (disabling === 'selection') await runBulk('disable')
      else await toggleStatus(disabling)
    } finally {
      setDisableBusy(false)
      setDisabling(null)
    }
  }

  /**
   * T09-04 (RGPD) — an admin exporting somebody else's data. Same download
   * mechanics as the self-service export on the profile screen; the server
   * enforces `self-or-admin` and journals the extraction either way, so
   * this button has nothing left to guard beyond being admin-only, which
   * this whole screen already is.
   */
  async function exportUserData(user: AdminUser): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      const report = await fetchPersonalDataExport(token, user.id)
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `cogenta-personal-data-${user.id}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setActionError(describeApiError(caught, t('users.exportDataError')))
    }
  }

  async function openSessions(user: AdminUser): Promise<void> {
    if (token === null) return
    setActionError(null)
    setSessionsOf(user)
    setSessions([])
    try {
      setSessions(await listUserSessions(token, user.id))
    } catch (caught) {
      setActionError(describeApiError(caught, t('users.sessionsError')))
    }
  }

  async function revoke(sessionId: string): Promise<void> {
    if (token === null || sessionsOf === null) return
    setActionError(null)
    try {
      await revokeUserSession(token, sessionsOf.id, sessionId)
      setSessions(await listUserSessions(token, sessionsOf.id))
    } catch (caught) {
      setActionError(describeApiError(caught, t('users.revokeError')))
    }
  }

  async function resend(user: AdminUser): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await resendInvitation(token, user.id)
      setActionNotice(t('users.inviteResent', { email: user.email }))
      await load()
    } catch (caught) {
      setActionError(describeApiError(caught, t('users.inviteResendError')))
    }
  }

  async function cancel(user: AdminUser): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await cancelInvitation(token, user.id)
      setActionNotice(t('users.inviteCancelled', { email: user.email }))
      await load()
    } catch (caught) {
      setActionError(describeApiError(caught, t('users.inviteCancelError')))
    }
  }

  async function runBulk(
    action: 'disable' | 'enable' | 'setRoles',
    roles?: readonly string[],
  ): Promise<void> {
    if (token === null || selected.size === 0) return
    setBulkBusy(true)
    setActionError(null)
    try {
      const input =
        action === 'setRoles'
          ? { action, ids: [...selected], roles: roles ?? [] }
          : { action, ids: [...selected] }
      const result = await bulkUpdateUsers(token, input)
      if (result.failed.length > 0) {
        setActionError({
          message: t('users.bulkPartialFailure', {
            succeeded: result.succeeded.length,
            failed: result.failed.length,
            reasons: result.failed.map((f) => f.error).join('; '),
          }),
        })
      } else {
        setActionNotice(t('users.bulkSuccess', { count: result.succeeded.length }))
      }
      setBulkRoleModal(false)
      await load()
    } catch (caught) {
      setActionError(describeApiError(caught, t('users.bulkError')))
    } finally {
      setBulkBusy(false)
    }
  }

  async function submitAnonymize(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || anonymizing === null) return
    setAnonymizeError(null)
    try {
      await anonymizeUser(token, anonymizing.id, anonymizeConfirm)
      setAnonymizing(null)
      setAnonymizeConfirm('')
      setActionNotice(t('users.anonymizeDone'))
      await load()
    } catch (caught) {
      setAnonymizeError(describeApiError(caught, t('users.anonymizeError')))
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="users-heading">
        <h1 id="users-heading">{t('users.heading')}</h1>
        <p role="alert">{t('users.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="users-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="users-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('users.heading')}
        </h1>
        <Button onClick={() => setCreating(true)}>{t('users.newButton')}</Button>
      </div>

      {created !== null && (
        <Notice
          tone="success"
          live="assertive"
          title={
            created.invited
              ? t('users.invitedTitle', { email: created.user.email })
              : t('users.createdTitle', { email: created.user.email })
          }
          onDismiss={() => setCreated(null)}
          dismissLabel={t('users.createdDismiss')}
        >
          {created.invited ? (
            <p>{t('users.invitedBody')}</p>
          ) : (
            <>
              <p>{t('users.createdBodyShort')}</p>
              {created.password !== undefined && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium">{t('users.passwordLabel')}</span>
                  <code className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-sm tracking-wide break-all select-all">
                    {created.password}
                  </code>
                  <CopyButton
                    value={created.password}
                    label={t('users.copyPassword')}
                    copiedLabel={t('users.copied')}
                  />
                </div>
              )}
            </>
          )}
        </Notice>
      )}

      {actionNotice !== null && (
        <Notice
          tone="success"
          live="polite"
          onDismiss={() => setActionNotice(null)}
          dismissLabel={t('common.cancel')}
        >
          <p>{actionNotice}</p>
        </Notice>
      )}

      {actionError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{actionError.message}</p>
          {actionError.hint !== undefined && <p>{actionError.hint}</p>}
        </Notice>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-xs">
          <Field label={t('users.roleFilter')}>
            {(control) => (
              <Select
                {...control}
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="">{t('users.allRoles')}</option>
                {offeredRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(t, role)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="max-w-xs">
          <Field label={t('users.sortLabel')}>
            {(control) => (
              <Select
                {...control}
                value={sortChoice}
                onChange={(event) => setSortChoice(event.target.value as SortChoice)}
              >
                <option value="createdAt:desc">{t('users.sortNewest')}</option>
                <option value="createdAt:asc">{t('users.sortOldest')}</option>
                <option value="lastSignInAt:desc">{t('users.sortMostActive')}</option>
                <option value="lastSignInAt:asc">{t('users.sortLeastActive')}</option>
              </Select>
            )}
          </Field>
        </div>

        <form
          className="flex max-w-sm flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmittedQuery(query)
          }}
        >
          <Field label={t('users.searchLabel')}>
            {(control) => (
              <Input
                {...control}
                type="search"
                placeholder={t('users.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="secondary">
            {t('users.searchButton')}
          </Button>
        </form>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
          <span className="text-sm">{t('users.selectedCount', { count: selected.size })}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={bulkBusy}
            onClick={() => setDisabling('selection')}
          >
            {t('users.bulkDisable')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={bulkBusy}
            onClick={() => void runBulk('enable')}
          >
            {t('users.bulkEnable')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={bulkBusy}
            onClick={() => {
              setBulkRoleSet(new Set())
              setBulkCustomRole('')
              setBulkRoleModal(true)
            }}
          >
            {t('users.bulkChangeRoles')}
          </Button>
        </div>
      )}

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error.message}</p>
          {error.hint !== undefined && <p>{error.hint}</p>}
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <TableRoot label={t('users.tableLabel')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>
                  <input
                    type="checkbox"
                    aria-label={t('users.selectAll')}
                    checked={users.length > 0 && selected.size === users.length}
                    onChange={toggleSelectAllOnPage}
                  />
                </TableHeader>
                <TableHeader>{t('users.emailColumn')}</TableHeader>
                <TableHeader>{t('users.rolesColumn')}</TableHeader>
                <TableHeader>{t('users.statusColumn')}</TableHeader>
                <TableHeader>{t('users.mfaColumn')}</TableHeader>
                <TableHeader className="whitespace-nowrap">
                  {t('users.lastSignInColumn')}
                </TableHeader>
                <TableHeader>{t('users.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell stack="select">
                    <input
                      type="checkbox"
                      aria-label={t('users.selectOne', { email: user.email })}
                      checked={selected.has(user.id)}
                      onChange={() => toggleSelected(user.id)}
                    />
                  </TableCell>
                  <TableCell stack="heading" className="min-w-[13rem]">
                    <div className="flex flex-col">
                      <span className="flex flex-wrap items-center gap-2">
                        {user.displayName ?? user.email}
                        {user.id === ownId && <Badge tone="info">{t('users.youBadge')}</Badge>}
                      </span>
                      {user.displayName !== null && (
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell label={t('users.rolesColumn')}>
                    <div className="flex flex-wrap justify-end gap-1 md:justify-start">
                      {user.roles.map((role) => (
                        <Badge key={role} tone={role === 'admin' ? 'primary' : 'neutral'}>
                          {roleLabel(t, role)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell label={t('users.statusColumn')}>
                    <div className="flex flex-col items-end gap-1 md:items-start">
                      <Badge tone={STATUS_TONE[user.status]}>
                        {user.status === 'active' && t('users.active')}
                        {user.status === 'disabled' && t('users.disabled')}
                        {user.status === 'invited' && t('users.invited')}
                        {user.status === 'anonymized' && t('users.anonymized')}
                      </Badge>
                      {user.status === 'invited' && (
                        <span className="text-xs text-muted-foreground">
                          {user.invitation !== null
                            ? t('users.invitedOn', { at: user.invitation.sentAt })
                            : t('users.invitedUnknownDate')}
                        </span>
                      )}
                      {user.dormant && <Badge tone="warning">{t('users.dormantBadge')}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell label={t('users.mfaColumn')}>
                    <div className="flex flex-col items-end gap-1 md:items-start">
                      <Badge tone={user.mfa.totp || user.mfa.passkeys > 0 ? 'success' : 'neutral'}>
                        {user.mfa.totp || user.mfa.passkeys > 0
                          ? t('users.mfaOn')
                          : t('users.mfaOff')}
                      </Badge>
                      {user.mfaRecommended && (
                        <Badge tone="warning">{t('users.mfaRecommendedBadge')}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap" label={t('users.lastSignInColumn')}>
                    {user.lastSignInAt === null
                      ? t('users.neverSignedIn')
                      : formatWhen(user.lastSignInAt)}
                  </TableCell>
                  <TableCell stack="actions">
                    {/* Short, generic visible labels — the full email lives
                        only in `aria-label`, disambiguating the same action
                        repeated across rows for assistive tech without
                        forcing every row this wide for sighted users too
                        (the "catastrophe" this replaces: five buttons per
                        row, each repeating the full address in plain
                        text). */}
                    <div className="flex flex-wrap gap-1.5">
                      {user.status === 'invited' ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!invitationEmailAvailable}
                            aria-label={t('users.resendInvite', { email: user.email })}
                            onClick={() => void resend(user)}
                          >
                            {t('users.resendInviteShort')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            aria-label={t('users.cancelInvite', { email: user.email })}
                            onClick={() => void cancel(user)}
                          >
                            {t('users.cancelInviteShort')}
                          </Button>
                        </>
                      ) : user.status === 'anonymized' ? (
                        <span className="text-xs text-muted-foreground">
                          {t('users.anonymizedNote')}
                        </span>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={t('users.changeRoles', { email: user.email })}
                            onClick={() => {
                              setEditing(user)
                              // Every role this account already holds is, by
                              // construction, in `knownRoles` and therefore in
                              // `offeredRoles` — nothing here needs the custom
                              // field pre-filled.
                              setEditRoleSet(new Set(user.roles))
                              setEditCustomRole('')
                            }}
                          >
                            {t('users.changeRolesShort')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('users.viewSessions', { email: user.email })}
                            onClick={() => void openSessions(user)}
                          >
                            {t('users.viewSessionsShort')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('users.exportData', { email: user.email })}
                            onClick={() => void exportUserData(user)}
                          >
                            {t('users.exportDataShort')}
                          </Button>
                          {user.id !== ownId && (
                            <Button
                              variant={user.status === 'active' ? 'destructive' : 'secondary'}
                              size="sm"
                              aria-label={
                                user.status === 'active'
                                  ? t('users.disableAccount', { email: user.email })
                                  : t('users.enableAccount', { email: user.email })
                              }
                              onClick={() =>
                                user.status === 'active'
                                  ? setDisabling(user)
                                  : void toggleStatus(user)
                              }
                            >
                              {user.status === 'active'
                                ? t('users.disableAccountShort')
                                : t('users.enableAccountShort')}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('users.anonymizeAccount', { email: user.email })}
                            onClick={() => {
                              setAnonymizing(user)
                              setAnonymizeConfirm('')
                              setAnonymizeError(null)
                            }}
                          >
                            {t('users.anonymizeAccountShort')}
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && <TableEmpty colSpan={7}>{t('users.empty')}</TableEmpty>}
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
          loadMoreLabel={t('users.loadMore')}
          loadingLabel={t('common.loading')}
        />
      )}

      <Modal
        open={creating}
        onOpenChange={(open) => {
          setCreating(open)
          if (!open) {
            setCreateError(null)
            setNewEmailError(null)
          }
        }}
        title={t('users.newHeading')}
        description={t('users.newDescription')}
        closeLabel={t('users.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="create-user-form">
              {invitationEmailAvailable && sendInvite
                ? t('users.inviteButton')
                : t('users.createButton')}
            </Button>
          </>
        }
      >
        <form
          id="create-user-form"
          noValidate
          onSubmit={submitCreate}
          className="flex flex-col gap-4"
        >
          {createError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{createError.message}</p>
              {createError.hint !== undefined && <p>{createError.hint}</p>}
            </Notice>
          )}
          <Field label={t('users.emailColumn')} error={newEmailError}>
            {(control) => (
              <Input
                {...control}
                type="email"
                required
                autoComplete="off"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
              />
            )}
          </Field>
          <RoleCheckboxList
            idPrefix="new-user-role"
            legend={t('users.rolesColumn')}
            description={t('users.rolesHint')}
            roles={offeredRoles}
            selected={newRoleSet}
            onToggle={(role) => setNewRoleSet((current) => toggleRole(current, role))}
          />
          <Field label={t('users.customRoleLabel')}>
            {(control) => (
              <Input
                {...control}
                placeholder={t('users.customRolePlaceholder')}
                value={newCustomRole}
                onChange={(event) => setNewCustomRole(event.target.value)}
              />
            )}
          </Field>

          {invitationEmailAvailable ? (
            <label className="flex items-center gap-2 font-sans text-sm leading-5 text-foreground">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(event) => setSendInvite(event.target.checked)}
                className="h-4 w-4 rounded-sm border border-input accent-primary"
              />
              {t('users.sendInviteLabel')}
            </label>
          ) : (
            <p className="m-0 text-xs leading-5 text-muted-foreground">
              {t('users.noInviteTransport')}
            </p>
          )}

          <RoleGrantsSummary
            roles={combineRoles(newRoleSet, newCustomRole)}
            schema={schema}
            locale={i18n.language}
          />
        </form>
      </Modal>

      <Modal
        open={disabling !== null}
        onOpenChange={(open) => {
          if (!open) setDisabling(null)
        }}
        title={
          disabling === 'selection'
            ? t('users.bulkDisableConfirmTitle', { count: selected.size })
            : t('users.disableConfirmTitle', { email: disabling?.email ?? '' })
        }
        closeLabel={t('users.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisabling(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={disableBusy}
              onClick={() => void confirmDisable()}
            >
              {t('users.disableConfirmButton')}
            </Button>
          </>
        }
      >
        <p className="m-0 text-sm text-muted-foreground">
          {disabling === 'selection'
            ? t('users.bulkDisableConfirmBody')
            : t('users.disableConfirmBody')}
        </p>
      </Modal>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={t('users.rolesHeading', { email: editing?.email ?? '' })}
        closeLabel={t('users.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="edit-user-roles-form">
              {t('users.saveRoles')}
            </Button>
          </>
        }
      >
        <form id="edit-user-roles-form" onSubmit={submitRoles} className="flex flex-col gap-4">
          {actionError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{actionError.message}</p>
              {actionError.hint !== undefined && <p>{actionError.hint}</p>}
            </Notice>
          )}
          <RoleCheckboxList
            idPrefix="edit-user-role"
            legend={t('users.rolesColumn')}
            description={t('users.rolesHint')}
            roles={offeredRoles}
            selected={editRoleSet}
            onToggle={(role) => setEditRoleSet((current) => toggleRole(current, role))}
          />
          <Field label={t('users.customRoleLabel')}>
            {(control) => (
              <Input
                {...control}
                placeholder={t('users.customRolePlaceholder')}
                value={editCustomRole}
                onChange={(event) => setEditCustomRole(event.target.value)}
              />
            )}
          </Field>
          <RoleGrantsSummary
            roles={combineRoles(editRoleSet, editCustomRole)}
            schema={schema}
            locale={i18n.language}
          />
        </form>
      </Modal>

      <Modal
        open={bulkRoleModal}
        onOpenChange={setBulkRoleModal}
        title={t('users.bulkRolesHeading', { count: selected.size })}
        closeLabel={t('users.close')}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const combined = combineRoles(bulkRoleSet, bulkCustomRole)
            if (combined.length === 0) {
              setActionError({ message: t('users.rolesNone') })
              return
            }
            void runBulk('setRoles', combined)
          }}
          className="flex flex-col gap-4"
        >
          <RoleCheckboxList
            idPrefix="bulk-role"
            legend={t('users.rolesColumn')}
            description={t('users.rolesHint')}
            roles={offeredRoles}
            selected={bulkRoleSet}
            onToggle={(role) => setBulkRoleSet((current) => toggleRole(current, role))}
          />
          <Field label={t('users.customRoleLabel')}>
            {(control) => (
              <Input
                {...control}
                placeholder={t('users.customRolePlaceholder')}
                value={bulkCustomRole}
                onChange={(event) => setBulkCustomRole(event.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulkRoleModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={bulkBusy}>
              {t('users.saveRoles')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={sessionsOf !== null}
        onOpenChange={(open) => {
          if (!open) setSessionsOf(null)
        }}
        title={t('users.sessionsHeading', { email: sessionsOf?.email ?? '' })}
        closeLabel={t('users.close')}
      >
        <SessionList sessions={sessions} onRevoke={(id) => void revoke(id)} />
      </Modal>

      <Modal
        open={anonymizing !== null}
        onOpenChange={(open) => {
          if (!open) setAnonymizing(null)
        }}
        title={t('users.anonymizeHeading', { email: anonymizing?.email ?? '' })}
        description={t('users.anonymizeWarning')}
        closeLabel={t('users.close')}
      >
        <form onSubmit={submitAnonymize} className="flex flex-col gap-4">
          {/* Fiche 61 task 2: confirm, in the screen itself and not just in
              code comments, that this is Cogenta's answer to "delete" — not
              a lesser option next to a hard delete that does not exist. */}
          <p className="text-sm text-muted-foreground">{t('users.anonymizeNoHardDelete')}</p>
          <Notice tone="danger">
            <p>{t('users.anonymizeIrreversible')}</p>
          </Notice>
          <Field
            label={t('users.anonymizeConfirmLabel', { email: anonymizing?.email ?? '' })}
            error={anonymizeError?.message ?? null}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                required
                autoComplete="off"
                value={anonymizeConfirm}
                onChange={(event) => setAnonymizeConfirm(event.target.value)}
              />
            )}
          </Field>
          {anonymizeError?.hint !== undefined && (
            <p className="m-0 text-xs leading-5 text-muted-foreground">{anonymizeError.hint}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAnonymizing(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={
                anonymizing !== null &&
                anonymizeConfirm.trim().toLowerCase() !== anonymizing.email.toLowerCase()
              }
            >
              {t('users.anonymizeConfirmButton')}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}

/**
 * Shared between this screen and the profile page: the same list of live
 * sessions, with the same revoke button, whether an admin is looking at
 * somebody else's or a person is looking at their own.
 */
export function SessionList({
  sessions,
  onRevoke,
  children,
}: {
  readonly sessions: readonly UserSession[]
  readonly children?: ReactNode
  onRevoke(sessionId: string): void
}): JSX.Element {
  const formatWhen = useDateTimeFormatter()
  const { t } = useTranslation()

  const pagination = useLocalPagination(sessions)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('users.sessionsTitle')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody>
        {children}
        {sessions.length === 0 && <p>{t('users.noSessions')}</p>}
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={t('users.sessionsTitle')}>
          {pagination.items.map((session, index) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="min-w-0 break-words text-sm [overflow-wrap:anywhere]">
                {session.label ?? t('users.unnamedSession')} —{' '}
                {sessionDeviceLabel(t, session.browser, session.device)} — {t('users.lastSeen')}{' '}
                {formatWhen(session.lastSeenAt)}
                {session.isCurrent && (
                  <>
                    {' '}
                    <strong>({t('users.currentSession')})</strong>
                  </>
                )}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-label={`${t('users.revokeSession', { at: formatWhen(session.lastSeenAt) })} — ${session.label ?? t('users.unnamedSession')} (${sessionDeviceLabel(t, session.browser, session.device)}) — ${t('users.sessionNumber', { number: pagination.start + index + 1 })}`}
                onClick={() => onRevoke(session.id)}
              >
                {t('users.revokeSessionShort')}
              </Button>
            </li>
          ))}
        </ul>
        <Pagination
          variant="pages"
          page={pagination.page}
          pageCount={pagination.pageCount}
          onPageChange={pagination.onPageChange}
          previousLabel={t('lists.previous')}
          nextLabel={t('lists.next')}
          pageInfo={t('lists.pageInfo', {
            from: pagination.start + 1,
            to: pagination.start + pagination.items.length,
            total: pagination.total,
          })}
        />
      </CardBody>
    </Card>
  )
}

/**
 * Fiche 19 task 2 — "cocher contributor affiche la liste exacte de ce que
 * cela autorise". Computed live from the schema this admin actually loaded
 * (`grantsForRole`), never a description written by hand that could drift
 * from what `cogenta.schema.*` really says on this site.
 *
 * Also carries the other half of the task: a role selected here that no
 * collection or taxonomy names anywhere is flagged — the one thing this
 * screen can catch that a generic role list cannot, and the exact bug
 * "editeur" typed instead of "editor" would otherwise cause silently.
 */
export function RoleGrantsSummary({
  roles,
  schema,
  locale,
}: {
  readonly roles: readonly string[]
  readonly schema: SchemaDocument | null
  readonly locale: string
}): JSX.Element | null {
  const { t } = useTranslation()

  if (schema === null || roles.length === 0) return null

  const known = new Set(knownRoleNames(schema))
  const unknown = roles.filter((role) => !known.has(role))

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <p className="m-0 text-xs font-medium leading-5 text-foreground">
        {t('users.roleGrantsHeading')}
      </p>
      {roles.map((role) => {
        const grants = grantsForRole(role, schema, locale)
        return (
          <div key={role}>
            <p className="m-0 text-sm font-semibold text-foreground">
              {t(`roles.${role}`, { defaultValue: role })}
            </p>
            {grants.length === 0 ? (
              <p className="m-0 text-xs text-muted-foreground">{t('users.roleGrantsNone')}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0 pl-3 text-xs text-muted-foreground">
                {grants.map((grant) => (
                  <li key={`${grant.subjectKind}-${grant.name}`}>
                    {grant.label}: {grant.actions.map((action) => t(ACTION_KEY[action])).join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {unknown.length > 0 && (
        <Notice tone="warning">
          <p className="m-0">
            {t('users.unknownRoleWarning', {
              roles: unknown.map((role) => roleLabel(t, role)).join(', '),
            })}
          </p>
        </Notice>
      )}
      <p className="m-0 text-xs text-muted-foreground">{t('users.roleGrantsLoadNote')}</p>
    </div>
  )
}

/**
 * A group of role checkboxes — plain `<fieldset>`/`<legend>` and Tailwind
 * classes lifted from the design system's own control styling
 * (`ui/field.tsx`'s `CONTROL_CLASSES`), not a seventh `ui/` component: a
 * checkbox *group* is a different shape from the six the design system
 * already covers (a single labelled control), and this is its only caller.
 *
 * Not built on `Field`: `Field` associates one label with one control via a
 * single generated id, which fits a text input or a select but not a list of
 * independently-labelled checkboxes — `<fieldset>`/`<legend>` is the
 * correct native pairing for a group instead.
 */
export function RoleCheckboxList({
  idPrefix,
  legend,
  description,
  roles,
  selected,
  onToggle,
}: {
  readonly idPrefix: string
  readonly legend: string
  readonly description?: string
  readonly roles: readonly string[]
  readonly selected: ReadonlySet<string>
  onToggle(role: string): void
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <fieldset className="flex flex-col gap-1.5 border-0 p-0 m-0">
      <legend className="font-sans text-sm leading-5 font-medium text-foreground p-0">
        {legend}
      </legend>
      {description !== undefined && (
        <p className="m-0 text-xs leading-5 text-muted-foreground">{description}</p>
      )}
      <div className="flex flex-col gap-2">
        {roles.map((role) => {
          const id = `${idPrefix}-${role}`
          return (
            <label
              key={role}
              htmlFor={id}
              className="flex items-center gap-2 font-sans text-sm leading-5 text-foreground"
            >
              <input
                id={id}
                type="checkbox"
                checked={selected.has(role)}
                onChange={() => onToggle(role)}
                className="h-4 w-4 rounded-sm border border-input accent-primary"
              />
              {/* Standard names get a translated label (`roles.<name>`); a
                  custom role typed into the free-text field and later shown
                  here as a checkbox has no translation and falls back to its
                  own raw name — it is a site-specific string, not one this
                  admin can translate for it. */}
              {t(`roles.${role}`, { defaultValue: role })}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
