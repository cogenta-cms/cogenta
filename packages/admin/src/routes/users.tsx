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
import { grantsForRole, knownRoleNames } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { SchemaDocument } from '../schema/types.js'
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
import { ACTION_KEY } from './roles.js'

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

/**
 * L11 task 3 — the account list, and everything an admin can do to an account
 * from the admin rather than from a terminal.
 *
 * `admin` only, and the screen says so plainly to anyone else rather than
 * rendering controls that would 403 (the server refuses either way — this is
 * courtesy, not the check).
 *
 * One thing is deliberately not here: deleting an account. Accounts are
 * disabled, never removed, because an account that wrote content still has to
 * be nameable in the audit log. Resetting somebody's password used to be
 * absent for the same "needs a delivery channel and a single-use token"
 * reason — it now exists, but as the self-service `/forgot-password` flow
 * (`packages/api/src/rest/auth-router.ts`), not as something an admin does to
 * someone else's account: an admin who could set another password could sign
 * in as that person, and every audit entry afterwards would name the wrong
 * one.
 */
export function UsersRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()
  const schema = schemaState.status === 'ready' ? schemaState.schema : null
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
  const [newRoleSet, setNewRoleSet] = useState<ReadonlySet<string>>(() => new Set(['editor']))
  const [newCustomRole, setNewCustomRole] = useState('')
  const [created, setCreated] = useState<CreatedUser | null>(null)

  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [editRoleSet, setEditRoleSet] = useState<ReadonlySet<string>>(() => new Set())
  const [editCustomRole, setEditCustomRole] = useState('')

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
      const result = await createUser(token, { email: newEmail, roles })
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
          <RoleGrantsSummary
            roles={combineRoles(newRoleSet, newCustomRole)}
            schema={schema}
            locale={i18n.language}
          />
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
function RoleGrantsSummary({
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
          <p className="m-0">{t('users.unknownRoleWarning', { roles: unknown.join(', ') })}</p>
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
