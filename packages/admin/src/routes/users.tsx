import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type AdminUser,
  type CreatedUser,
  createUser,
  listUserSessions,
  listUsers,
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
 * L11 task 3 — the account list, and everything an admin can do to an account
 * from the admin rather than from a terminal.
 *
 * `admin` only, and the screen says so plainly to anyone else rather than
 * rendering controls that would 403 (the server refuses either way — this is
 * courtesy, not the check).
 *
 * Two things are deliberately not here. Deleting an account: accounts are
 * disabled, never removed, because an account that wrote content still has to
 * be nameable in the audit log. And resetting somebody's password: that needs a
 * delivery channel and a single-use token to be anything but a back door, and
 * it is L13's task — an admin who could set another password could sign in as
 * that person, and every entry afterwards would name the wrong one.
 */
export function UsersRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [users, setUsers] = useState<readonly AdminUser[]>([])
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRoles, setNewRoles] = useState('editor')
  const [created, setCreated] = useState<CreatedUser | null>(null)

  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [editRoles, setEditRoles] = useState('')

  const [sessionsOf, setSessionsOf] = useState<AdminUser | null>(null)
  const [sessions, setSessions] = useState<readonly UserSession[]>([])

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setUsers(await listUsers(token, { role: roleFilter }))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('users.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, roleFilter, t])

  useEffect(() => {
    void load()
  }, [load])

  /** Every role name any account actually holds — the filter offers real values, not a guessed list. */
  const knownRoles = [...new Set(users.flatMap((user) => user.roles))].sort()

  function parseRoles(raw: string): string[] {
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
      const result = await createUser(token, {
        email: newEmail,
        roles: parseRoles(newRoles),
      })
      setCreated(result)
      setCreating(false)
      setNewEmail('')
      setNewRoles('editor')
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('users.createError'))
    }
  }

  async function submitRoles(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || editing === null) return
    setActionError(null)
    try {
      await updateUser(token, editing.id, { roles: parseRoles(editRoles) })
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
          title={t('users.createdTitle', { email: created.user.email })}
          onDismiss={() => setCreated(null)}
          dismissLabel={t('users.createdDismiss')}
        >
          <p>{t('users.createdBody')}</p>
          <p className="font-mono text-sm break-all">{created.password}</p>
        </Notice>
      )}

      {actionError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{actionError}</p>
        </Notice>
      )}

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
                <TableHeader>{t('users.emailColumn')}</TableHeader>
                <TableHeader>{t('users.rolesColumn')}</TableHeader>
                <TableHeader>{t('users.statusColumn')}</TableHeader>
                <TableHeader>{t('users.mfaColumn')}</TableHeader>
                <TableHeader>{t('users.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.roles.join(', ')}</TableCell>
                  <TableCell>
                    {user.status === 'active' ? t('users.active') : t('users.disabled')}
                  </TableCell>
                  <TableCell>
                    {user.mfa.totp || user.mfa.passkeys > 0 ? t('users.mfaOn') : t('users.mfaOff')}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(user)
                          setEditRoles(user.roles.join(', '))
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && <TableEmpty colSpan={5}>{t('users.empty')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
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
          <Field label={t('users.rolesColumn')} description={t('users.rolesHint')}>
            {(control) => (
              <Input
                {...control}
                required
                value={newRoles}
                onChange={(event) => setNewRoles(event.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('users.createButton')}</Button>
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
          <Field label={t('users.rolesColumn')} description={t('users.rolesHint')}>
            {(control) => (
              <Input
                {...control}
                required
                value={editRoles}
                onChange={(event) => setEditRoles(event.target.value)}
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
        open={sessionsOf !== null}
        onOpenChange={(open) => {
          if (!open) setSessionsOf(null)
        }}
        title={t('users.sessionsHeading', { email: sessionsOf?.email ?? '' })}
        closeLabel={t('users.close')}
      >
        <SessionList sessions={sessions} onRevoke={(id) => void revoke(id)} />
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
                {session.label ?? t('users.unnamedSession')} — {t('users.lastSeen')}{' '}
                {session.lastSeenAt}
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
