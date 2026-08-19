import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type AdminUser,
  anonymizeUser,
  bulkUpdateUsers,
  type CreatedUser,
  cancelInvitation,
  createUser,
  listUserSessions,
  listUsersPage,
  resendInvitation,
  revokeUserSession,
  type UserSession,
  updateUser,
} from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Modal,
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
 * The four role names every new site is offered, whether or not any account
 * on it holds them yet.
 *
 * This is a **UX convention, not a server constraint** — contract A still
 * only knows five permission actions (`read`/`create`/`update`/`delete`/
 * `publish`) per collection, and a role is still, as far as the server is
 * concerned, an arbitrary string a collection's `permissions` block happens
 * to name. Nothing here is a vocabulary change or a contract A addition:
 * `rolesField` in `users-router.ts` still accepts any non-empty string, and a
 * site can (and does, via the custom-role field below) use names these four
 * were never meant to describe. They exist only so a fresh site's first admin
 * is not staring at an empty checkbox list and a blank text field.
 */
const STANDARD_ROLES = ['admin', 'editor', 'author', 'contributor'] as const

const PAGE_SIZE = 25

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
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [users, setUsers] = useState<readonly AdminUser[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [invitationEmailAvailable, setInvitationEmailAvailable] = useState(false)
  const [roleFilter, setRoleFilter] = useState('')
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [sortChoice, setSortChoice] = useState<SortChoice>('createdAt:desc')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())

  const [creating, setCreating] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRoleSet, setNewRoleSet] = useState<ReadonlySet<string>>(() => new Set(['editor']))
  const [newCustomRole, setNewCustomRole] = useState('')
  const [sendInvite, setSendInvite] = useState(true)
  const [created, setCreated] = useState<CreatedUser | null>(null)

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
  const [anonymizeError, setAnonymizeError] = useState<string | null>(null)

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
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
      setInvitationEmailAvailable(page.invitationEmailAvailable)
      setSelected(new Set())
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('users.loadError'))
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
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('users.loadError'))
    } finally {
      setLoadingMore(false)
    }
  }

  /** Every role name any account actually holds — the filter offers real values, not a guessed list. */
  const knownRoles = [...new Set(users.flatMap((user) => user.roles))].sort()

  /**
   * The checkbox list this admin offers: the four standard names, first and
   * always, followed by whatever else this site's accounts already use that
   * is not one of them — a role a previous admin typed into the custom field
   * shows up here as a checkbox too, next time, rather than only ever being
   * reachable by retyping it.
   */
  const offeredRoles = [
    ...STANDARD_ROLES,
    ...knownRoles.filter((role) => !(STANDARD_ROLES as readonly string[]).includes(role)),
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
    setActionError(null)
    const roles = combineRoles(newRoleSet, newCustomRole)
    if (roles.length === 0) {
      setActionError(t('users.rolesNone'))
      return
    }
    try {
      const result = await createUser(token, {
        email: newEmail,
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
      setActionError(caught instanceof ApiError ? caught.message : t('users.createError'))
    }
  }

  async function submitRoles(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    setActionError(null)
    const roles = combineRoles(editRoleSet, editCustomRole)
    if (roles.length === 0) {
      setActionError(t('users.rolesNone'))
      return
    }
    try {
      await updateUser(token, editing.id, { roles })
      setEditing(null)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('users.updateError'))
    }
  }

  async function toggleStatus(user: AdminUser): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await updateUser(token, user.id, {
        status: user.status === 'active' ? 'disabled' : 'active',
      })
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('users.updateError'))
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
      setActionError(caught instanceof ApiError ? caught.message : t('users.sessionsError'))
    }
  }

  async function revoke(sessionId: string): Promise<void> {
    if (token === null || sessionsOf === null) return
    setActionError(null)
    try {
      await revokeUserSession(token, sessionsOf.id, sessionId)
      setSessions(await listUserSessions(token, sessionsOf.id))
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('users.revokeError'))
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
      setActionError(caught instanceof ApiError ? caught.message : t('users.inviteResendError'))
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
      setActionError(caught instanceof ApiError ? caught.message : t('users.inviteCancelError'))
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
        setActionError(
          t('users.bulkPartialFailure', {
            succeeded: result.succeeded.length,
            failed: result.failed.length,
            reasons: result.failed.map((f) => f.error).join('; '),
          }),
        )
      } else {
        setActionNotice(t('users.bulkSuccess', { count: result.succeeded.length }))
      }
      setBulkRoleModal(false)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('users.bulkError'))
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
      setAnonymizeError(caught instanceof ApiError ? caught.message : t('users.anonymizeError'))
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
        <h1 id="users-heading" className="m-0 text-xl leading-7 font-semibold">
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
              <p>
                {invitationEmailAvailable ? t('users.createdBodyNoInvite') : t('users.createdBody')}
              </p>
              <p className="font-mono text-sm break-all">{created.password}</p>
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
          <p>{actionError}</p>
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
                {knownRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
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
            onClick={() => void runBulk('disable')}
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
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <TableRoot label={t('users.tableLabel')}>
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
                <TableHeader>{t('users.lastSignInColumn')}</TableHeader>
                <TableHeader>{t('users.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={t('users.selectOne', { email: user.email })}
                      checked={selected.has(user.id)}
                      onChange={() => toggleSelected(user.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{user.displayName ?? user.email}</span>
                      {user.displayName !== null && (
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{user.roles.join(', ')}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>
                        {user.status === 'active' && t('users.active')}
                        {user.status === 'disabled' && t('users.disabled')}
                        {user.status === 'invited' && t('users.invited')}
                        {user.status === 'anonymized' && t('users.anonymized')}
                      </span>
                      {user.status === 'invited' && (
                        <span className="text-xs text-muted-foreground">
                          {user.invitation !== null
                            ? t('users.invitedOn', { at: user.invitation.sentAt })
                            : t('users.invitedUnknownDate')}
                        </span>
                      )}
                      {user.dormant && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-sm border border-warning bg-warning/10 px-1.5 py-0.5 text-xs text-warning">
                          {t('users.dormantBadge')}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>
                        {user.mfa.totp || user.mfa.passkeys > 0
                          ? t('users.mfaOn')
                          : t('users.mfaOff')}
                      </span>
                      {user.mfaRecommended && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-sm border border-warning bg-warning/10 px-1.5 py-0.5 text-xs text-warning">
                          {t('users.mfaRecommendedBadge')}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{user.lastSignInAt ?? t('users.neverSignedIn')}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {user.status === 'invited' ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!invitationEmailAvailable}
                            onClick={() => void resend(user)}
                          >
                            {t('users.resendInvite', { email: user.email })}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => void cancel(user)}>
                            {t('users.cancelInvite', { email: user.email })}
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
                            {t('users.changeRoles', { email: user.email })}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void openSessions(user)}>
                            {t('users.viewSessions', { email: user.email })}
                          </Button>
                          <Button
                            variant={user.status === 'active' ? 'destructive' : 'secondary'}
                            size="sm"
                            onClick={() => void toggleStatus(user)}
                          >
                            {user.status === 'active'
                              ? t('users.disableAccount', { email: user.email })
                              : t('users.enableAccount', { email: user.email })}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAnonymizing(user)
                              setAnonymizeConfirm('')
                              setAnonymizeError(null)
                            }}
                          >
                            {t('users.anonymizeAccount', { email: user.email })}
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

      {!loading && hasMore && (
        <div>
          <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? t('common.loading') : t('users.loadMore')}
          </Button>
        </div>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={t('users.newHeading')}
        description={t('users.newDescription')}
        closeLabel={t('users.close')}
      >
        <form id="create-user-form" onSubmit={submitCreate} className="flex flex-col gap-4">
          <Field label={t('users.emailColumn')}>
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

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {invitationEmailAvailable && sendInvite
                ? t('users.inviteButton')
                : t('users.createButton')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={t('users.rolesHeading', { email: editing?.email ?? '' })}
        closeLabel={t('users.close')}
      >
        <form onSubmit={submitRoles} className="flex flex-col gap-4">
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
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('users.saveRoles')}</Button>
          </div>
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
              setActionError(t('users.rolesNone'))
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
          <Notice tone="danger">
            <p>{t('users.anonymizeIrreversible')}</p>
          </Notice>
          <Field
            label={t('users.anonymizeConfirmLabel', { email: anonymizing?.email ?? '' })}
            error={anonymizeError}
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
}: {
  readonly sessions: readonly UserSession[]
  onRevoke(sessionId: string): void
}): JSX.Element {
  const { t } = useTranslation()

  if (sessions.length === 0) return <p>{t('users.noSessions')}</p>

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('users.sessionsTitle')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">
                {session.label ?? t('users.unnamedSession')} —{' '}
                {t('users.sessionDevice', { browser: session.browser, device: session.device })} —{' '}
                {t('users.lastSeen')} {session.lastSeenAt}
                {session.isCurrent && (
                  <>
                    {' '}
                    <strong>({t('users.currentSession')})</strong>
                  </>
                )}
              </span>
              <Button variant="destructive" size="sm" onClick={() => onRevoke(session.id)}>
                {t('users.revokeSession', { at: session.lastSeenAt })}
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
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
function RoleCheckboxList({
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
