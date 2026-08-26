import type { TFunction } from 'i18next'
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { getCommercePermissions } from '../api/commerce-client.js'
import {
  listRolePermissionOverrides,
  type RolePermissionOverride,
  removeRolePermissionOverride,
  setRolePermissionOverride,
} from '../api/role-permissions-client.js'
import { listUsers } from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  diagnosePermissions,
  type PermissionAnomaly,
  type PermissionAnomalySeverity,
} from '../schema/permission-diagnostics.js'
import {
  ALL_CONTENT_ACTIONS,
  grantsForRole,
  knownRoleNames,
  taxonomyLabel,
} from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import {
  type CollectionSummary,
  type ContentAction,
  normalisePermissionRule,
  type TaxonomySummary,
} from '../schema/types.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Modal,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * Fiche 19, tasks 1-3 gave this screen its read-only matrix and anomaly
 * diagnostics. Fiche 63 (ADR-0028) adds the write half: a role's grant on a
 * collection or taxonomy action can now be overridden straight in the
 * database, applied on the very next request, no deploy cycle. The file
 * (`cogenta.schema.*`) stays what an admin sees first and what an override
 * always falls back to — this screen never invents a permission that
 * `PermissionLayer` (`@cogenta/api`, `role-permission-overlay.ts`) would not
 * also grant, because both read the exact same table.
 *
 * Every write goes through `PermissionEditorModal`'s two-step flow — edit,
 * then an explicit confirmation screen naming the change before it is sent —
 * and every successful write is journaled server-side
 * (`recordRolePermissionAudit` in `cogenta serve`) whether or not this
 * screen was the one that made the call, so "aucun changement de permission
 * sans... entrée d'audit systématique" holds even against a direct API call.
 */
export function RolesRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [tab, setTab] = useState<'byCollection' | 'byRole'>('byCollection')
  const [roleUsage, setRoleUsage] = useState<Readonly<Record<string, number>> | null>(null)
  const [commerce, setCommerce] = useState<{
    readonly permissions: readonly string[]
    readonly roles: Readonly<Record<string, readonly string[]>>
  } | null>(null)
  const [overrides, setOverrides] = useState<readonly RolePermissionOverride[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const [users, commercePermissions, overrideRows] = await Promise.all([
        listUsers(token),
        getCommercePermissions(token),
        listRolePermissionOverrides(token),
      ])
      const usage: Record<string, number> = {}
      for (const user of users) {
        for (const role of user.roles) usage[role] = (usage[role] ?? 0) + 1
      }
      setRoleUsage(usage)
      setCommerce(commercePermissions)
      setOverrides(overrideRows)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('rolesMatrix.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const reloadOverrides = useCallback(async () => {
    if (token === null) return
    setOverrides(await listRolePermissionOverrides(token))
  }, [token])

  const overridesByKey = useMemo(() => {
    const map = new Map<string, RolePermissionOverride>()
    for (const override of overrides ?? []) {
      map.set(overrideKey(override.targetType, override.targetName, override.action), override)
    }
    return map
  }, [overrides])

  if (!isAdmin) {
    return (
      <section aria-labelledby="roles-heading">
        <h1 id="roles-heading">{t('rolesMatrix.heading')}</h1>
        <p role="alert">{t('rolesMatrix.adminOnly')}</p>
      </section>
    )
  }

  const schema = schemaState.status === 'ready' ? schemaState.schema : null
  const collections = schema?.collections ?? []
  const taxonomies = schema?.taxonomies ?? []
  const anomalies =
    schema !== null && roleUsage !== null
      ? diagnosePermissions(schema, roleUsage, i18n.language)
      : []
  const roleNames =
    schema !== null && roleUsage !== null
      ? [...new Set([...knownRoleNames(schema), ...Object.keys(roleUsage)])].sort()
      : []
  const candidateRoles = [...new Set(['public', 'viewer', 'editor', 'admin', ...roleNames])].sort()

  return (
    <section aria-labelledby="roles-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="roles-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('rolesMatrix.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('rolesMatrix.description')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {notice !== null && (
        <Notice tone="success" live="polite">
          <p className="m-0">{notice}</p>
        </Notice>
      )}
      {(loading || schemaState.status === 'loading') && <p>{t('common.loading')}</p>}
      {schemaState.status === 'error' && (
        <Notice tone="danger" live="assertive">
          <p>{schemaState.message}</p>
        </Notice>
      )}

      {schema !== null && roleUsage !== null && (
        <>
          <AnomaliesCard anomalies={anomalies} />

          <div
            role="tablist"
            aria-label={t('rolesMatrix.tabsLabel')}
            className="flex gap-2 border-b border-border"
          >
            {(
              [
                ['byCollection', t('rolesMatrix.tabByCollection')],
                ['byRole', t('rolesMatrix.tabByRole')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`roles-tab-${key}`}
                aria-selected={tab === key}
                aria-controls={`roles-panel-${key}`}
                className={
                  tab === key
                    ? 'border-b-2 border-primary px-3 py-2 text-sm font-semibold text-foreground'
                    : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground'
                }
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'byCollection' && (
            <div
              id="roles-panel-byCollection"
              role="tabpanel"
              aria-labelledby="roles-tab-byCollection"
            >
              <ByCollectionMatrix
                collections={collections}
                taxonomies={taxonomies}
                locale={i18n.language}
                overridesByKey={overridesByKey}
                onEdit={setEditingCell}
              />
            </div>
          )}

          {tab === 'byRole' && (
            <div id="roles-panel-byRole" role="tabpanel" aria-labelledby="roles-tab-byRole">
              <ByRoleMatrix
                roles={roleNames}
                collections={collections}
                taxonomies={taxonomies}
                locale={i18n.language}
              />
            </div>
          )}

          {commerce !== null && (
            <CommerceSection permissions={commerce.permissions} roles={commerce.roles} />
          )}

          <Card aria-labelledby="roles-other-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="roles-other-heading">{t('rolesMatrix.otherHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p className="m-0">{t('rolesMatrix.apiKeysNote')}</p>
              <p className="m-0">{t('rolesMatrix.pluginsNote')}</p>
            </CardBody>
          </Card>
        </>
      )}

      {editingCell !== null && token !== null && (
        <PermissionEditorModal
          token={token}
          cell={editingCell}
          existingOverride={overridesByKey.get(
            overrideKey(editingCell.subjectKind, editingCell.name, editingCell.action),
          )}
          candidateRoles={candidateRoles}
          onClose={() => setEditingCell(null)}
          onSaved={(message) => {
            setEditingCell(null)
            setNotice(message)
            void reloadOverrides()
          }}
        />
      )}
    </section>
  )
}

/** Shared with `users.tsx`'s role-grants preview — one place that maps a contract A action to its translation key. */
export const ACTION_KEY: Readonly<Record<ContentAction, string>> = {
  read: 'rolesMatrix.actionRead',
  create: 'rolesMatrix.actionCreate',
  update: 'rolesMatrix.actionUpdate',
  delete: 'rolesMatrix.actionDelete',
  publish: 'rolesMatrix.actionPublish',
}

const ANOMALY_TONE: Readonly<Record<PermissionAnomalySeverity, 'danger' | 'warning'>> = {
  high: 'danger',
  medium: 'warning',
  low: 'warning',
}

function AnomaliesCard({
  anomalies,
}: {
  readonly anomalies: readonly PermissionAnomaly[]
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <Card aria-labelledby="roles-anomalies-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="roles-anomalies-heading">{t('rolesMatrix.anomaliesHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        {anomalies.length === 0 ? (
          <Notice tone="success">
            <p className="m-0">{t('rolesMatrix.noAnomalies')}</p>
          </Notice>
        ) : (
          anomalies.map((anomaly) => (
            <Notice
              key={`${anomaly.kind}-${anomaly.subjectKind}-${anomaly.subject}`}
              tone={ANOMALY_TONE[anomaly.severity]}
            >
              <p className="m-0">{anomalyMessage(anomaly, t)}</p>
            </Notice>
          ))
        )}
      </CardBody>
    </Card>
  )
}

function anomalyMessage(anomaly: PermissionAnomaly, t: TFunction): string {
  switch (anomaly.kind) {
    case 'unreadable':
      return t('rolesMatrix.anomalyUnreadable', { label: anomaly.label })
    case 'publicWrite':
      return t('rolesMatrix.anomalyPublicWrite', {
        label: anomaly.label,
        actions: (anomaly.actions ?? []).map((action) => t(ACTION_KEY[action])).join(', '),
      })
    case 'routedNotPublic':
      return t('rolesMatrix.anomalyRoutedNotPublic', { label: anomaly.label })
    case 'unknownRoleInUse':
      return t('rolesMatrix.anomalyUnknownRoleInUse', {
        role: anomaly.subject,
        count: anomaly.accountCount ?? 0,
      })
    case 'unusedRole':
      return t('rolesMatrix.anomalyUnusedRole', { role: anomaly.subject })
    default:
      return anomaly.kind satisfies never
  }
}

/** Which action, on which collection or taxonomy, `PermissionEditorModal` is open for. */
interface EditingCell {
  readonly subjectKind: 'collection' | 'taxonomy'
  readonly name: string
  readonly label: string
  readonly action: ContentAction
  readonly fileRule: { readonly roles: readonly string[]; readonly own: boolean }
}

function overrideKey(subjectKind: 'collection' | 'taxonomy', name: string, action: string): string {
  return `${subjectKind}:${name}:${action}`
}

function ByCollectionMatrix({
  collections,
  taxonomies,
  locale,
  overridesByKey,
  onEdit,
}: {
  readonly collections: readonly CollectionSummary[]
  readonly taxonomies: readonly TaxonomySummary[]
  readonly locale: string
  readonly overridesByKey: ReadonlyMap<string, RolePermissionOverride>
  readonly onEdit: (cell: EditingCell) => void
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <TableRoot label={t('rolesMatrix.byCollectionTableLabel')}>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t('rolesMatrix.subjectColumn')}</TableHeader>
            {ALL_CONTENT_ACTIONS.map((action) => (
              <TableHeader key={action}>{t(ACTION_KEY[action])}</TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {collections.map((collection) => (
            <TableRow key={`collection-${collection.name}`}>
              <TableCell className="font-medium">{collection.labels.plural}</TableCell>
              {ALL_CONTENT_ACTIONS.map((action) => (
                <PermissionCell
                  key={action}
                  subjectKind="collection"
                  name={collection.name}
                  label={collection.labels.plural}
                  action={action}
                  fileRule={normalisePermissionRule(collection.permissions[action])}
                  override={overridesByKey.get(overrideKey('collection', collection.name, action))}
                  onEdit={onEdit}
                />
              ))}
            </TableRow>
          ))}
          {taxonomies.map((taxonomy) => {
            const label = taxonomyLabel(taxonomy, locale)
            return (
              <TableRow key={`taxonomy-${taxonomy.name}`}>
                <TableCell className="font-medium">
                  {label}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t('rolesMatrix.taxonomyBadge')}
                  </span>
                </TableCell>
                {ALL_CONTENT_ACTIONS.map((action) =>
                  action === 'publish' ? (
                    // Contract A: a term is never published (defineTaxonomy refuses the action outright).
                    <TableCell key={action} className="text-sm text-muted-foreground">
                      —
                    </TableCell>
                  ) : (
                    <PermissionCell
                      key={action}
                      subjectKind="taxonomy"
                      name={taxonomy.name}
                      label={label}
                      action={action}
                      fileRule={normalisePermissionRule(taxonomy.permissions[action])}
                      override={overridesByKey.get(overrideKey('taxonomy', taxonomy.name, action))}
                      onEdit={onEdit}
                    />
                  ),
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableRoot>
  )
}

function PermissionCell({
  subjectKind,
  name,
  label,
  action,
  fileRule,
  override,
  onEdit,
}: {
  readonly subjectKind: 'collection' | 'taxonomy'
  readonly name: string
  readonly label: string
  readonly action: ContentAction
  readonly fileRule: { readonly roles: readonly string[]; readonly own: boolean }
  readonly override: RolePermissionOverride | undefined
  readonly onEdit: (cell: EditingCell) => void
}): JSX.Element {
  const { t } = useTranslation()
  const effective = override ?? fileRule
  const text = effective.roles.length === 0 ? '—' : effective.roles.join(', ')

  return (
    <TableCell className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {text}
          {effective.own && ' (own)'}
        </span>
        {override !== undefined && (
          <span
            className="inline-flex w-fit items-center rounded-sm border border-warning bg-warning/10 px-1.5 py-0.5 text-xs text-warning"
            title={t('rolesMatrix.overriddenTitle')}
          >
            {t('rolesMatrix.overriddenBadge')}
          </span>
        )}
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => onEdit({ subjectKind, name, label, action, fileRule })}
        >
          {t('rolesMatrix.editButton')}
        </button>
      </div>
    </TableCell>
  )
}

function ByRoleMatrix({
  roles,
  collections,
  taxonomies,
  locale,
}: {
  readonly roles: readonly string[]
  readonly collections: readonly CollectionSummary[]
  readonly taxonomies: readonly TaxonomySummary[]
  readonly locale: string
}): JSX.Element {
  const { t } = useTranslation()
  const schema = { collections, taxonomies }

  return (
    <TableRoot label={t('rolesMatrix.byRoleTableLabel')}>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t('rolesMatrix.roleColumn')}</TableHeader>
            {collections.map((collection) => (
              <TableHeader key={collection.name}>{collection.labels.plural}</TableHeader>
            ))}
            {taxonomies.map((taxonomy) => (
              <TableHeader key={taxonomy.name}>{taxonomyLabel(taxonomy, locale)}</TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {roles.map((role) => {
            const grants = grantsForRole(role, schema, locale)
            const bySubject = new Map(grants.map((grant) => [grant.name, grant]))
            return (
              <TableRow key={role}>
                <TableCell className="font-medium">
                  {t(`roles.${role}`, { defaultValue: role })}
                </TableCell>
                {collections.map((collection) => (
                  <TableCell key={collection.name} className="text-sm">
                    {formatActions(bySubject.get(collection.name)?.actions, t)}
                  </TableCell>
                ))}
                {taxonomies.map((taxonomy) => (
                  <TableCell key={taxonomy.name} className="text-sm">
                    {formatActions(bySubject.get(taxonomy.name)?.actions, t)}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
          {roles.length === 0 && (
            <TableRow>
              <TableCell colSpan={1 + collections.length + taxonomies.length}>
                {t('rolesMatrix.noRoles')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableRoot>
  )
}

function formatActions(actions: readonly ContentAction[] | undefined, t: TFunction): string {
  if (actions === undefined || actions.length === 0) return '—'
  return actions.map((action) => t(ACTION_KEY[action])).join(', ')
}

function CommerceSection({
  permissions,
  roles,
}: {
  readonly permissions: readonly string[]
  readonly roles: Readonly<Record<string, readonly string[]>>
}): JSX.Element {
  const { t } = useTranslation()
  const roleNames = Object.keys(roles).sort()

  return (
    <Card aria-labelledby="roles-commerce-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="roles-commerce-heading">{t('rolesMatrix.commerceHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <p className="m-0 text-sm text-muted-foreground">{t('rolesMatrix.commerceDescription')}</p>
        <TableRoot label={t('rolesMatrix.commerceTableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('rolesMatrix.roleColumn')}</TableHeader>
                {permissions.map((permission) => (
                  <TableHeader key={permission} className="font-mono text-xs">
                    {permission}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {roleNames.map((role) => (
                <TableRow key={role}>
                  <TableCell className="font-medium">
                    {t(`roles.${role}`, { defaultValue: role })}
                  </TableCell>
                  {permissions.map((permission) => (
                    <TableCell key={permission} className="text-center text-sm">
                      {(roles[role] ?? []).includes(permission) ? '✓' : '—'}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
      </CardBody>
    </Card>
  )
}

/**
 * Two steps, on purpose (fiche 63: "aucun changement de permission sans
 * confirmation explicite"): `edit` lets an admin change the role list (and,
 * for a collection, the `own` clause); `confirm` shows exactly what will
 * change — before and after, side by side — and is the only step that ever
 * calls the API. Reverting to the file's own rule goes through the very same
 * confirmation screen, because dropping an override is also a permission
 * change.
 */
function PermissionEditorModal({
  token,
  cell,
  existingOverride,
  candidateRoles,
  onClose,
  onSaved,
}: {
  readonly token: string
  readonly cell: EditingCell
  readonly existingOverride: RolePermissionOverride | undefined
  readonly candidateRoles: readonly string[]
  readonly onClose: () => void
  readonly onSaved: (message: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const current = existingOverride ?? cell.fileRule

  const [step, setStep] = useState<'edit' | 'confirmSet' | 'confirmReset'>('edit')
  const [selectedRoles, setSelectedRoles] = useState<readonly string[]>(current.roles)
  const [own, setOwn] = useState(current.own)
  const [roleInput, setRoleInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const roleOptions = useMemo(
    () => [...new Set([...candidateRoles, ...selectedRoles])].sort(),
    [candidateRoles, selectedRoles],
  )

  function toggleRole(role: string): void {
    setSelectedRoles((existing) =>
      existing.includes(role) ? existing.filter((r) => r !== role) : [...existing, role],
    )
  }

  function addCustomRole(): void {
    const role = roleInput.trim()
    if (role === '' || selectedRoles.includes(role)) return
    setSelectedRoles((existing) => [...existing, role])
    setRoleInput('')
  }

  async function confirmSet(): Promise<void> {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await setRolePermissionOverride(token, {
        targetType: cell.subjectKind,
        targetName: cell.name,
        action: cell.action,
        roles: selectedRoles,
        ...(cell.subjectKind === 'collection' ? { own } : {}),
      })
      onSaved(t('rolesMatrix.saveSuccess'))
    } catch (caught) {
      setSubmitError(caught instanceof ApiError ? caught.message : t('rolesMatrix.saveError'))
      setSubmitting(false)
    }
  }

  async function confirmReset(): Promise<void> {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await removeRolePermissionOverride(token, cell.subjectKind, cell.name, cell.action)
      onSaved(t('rolesMatrix.resetSuccess'))
    } catch (caught) {
      setSubmitError(caught instanceof ApiError ? caught.message : t('rolesMatrix.saveError'))
      setSubmitting(false)
    }
  }

  const actionLabel = t(ACTION_KEY[cell.action])
  const heading =
    step === 'confirmReset'
      ? t('rolesMatrix.resetConfirmHeading')
      : step === 'confirmSet'
        ? t('rolesMatrix.confirmHeading')
        : t('rolesMatrix.editHeading', { label: cell.label, action: actionLabel })

  return (
    <Modal
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={heading}
      closeLabel={t('rolesMatrix.closeLabel')}
      footer={
        step === 'edit' ? (
          <>
            {existingOverride !== undefined && (
              <Button variant="ghost" onClick={() => setStep('confirmReset')}>
                {t('rolesMatrix.resetButton')}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              {t('rolesMatrix.cancelButton')}
            </Button>
            <Button onClick={() => setStep('confirmSet')}>{t('rolesMatrix.reviewButton')}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep('edit')} disabled={submitting}>
              {t('rolesMatrix.backButton')}
            </Button>
            <Button
              variant={step === 'confirmReset' ? 'destructive' : 'primary'}
              onClick={() => void (step === 'confirmReset' ? confirmReset() : confirmSet())}
              disabled={submitting}
            >
              {t('rolesMatrix.confirmButton')}
            </Button>
          </>
        )
      }
    >
      {submitError !== null && (
        <Notice tone="danger" live="assertive">
          <p className="m-0">{submitError}</p>
        </Notice>
      )}

      {step === 'edit' && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-muted-foreground">
            {existingOverride === undefined
              ? t('rolesMatrix.sourceFile')
              : t('rolesMatrix.sourceOverride')}
          </p>
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-sm font-medium text-foreground">
              {t('rolesMatrix.rolesLabel')}
            </legend>
            {roleOptions.map((role) => (
              <label
                key={role}
                className="flex items-center gap-2 font-sans text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
                {t(`roles.${role}`, { defaultValue: role })}
              </label>
            ))}
            {selectedRoles.length === 0 && (
              <p className="m-0 text-xs text-muted-foreground">
                {t('rolesMatrix.noRolesSelected')}
              </p>
            )}
          </fieldset>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={roleInput}
              onChange={(event) => setRoleInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addCustomRole()
                }
              }}
              placeholder={t('rolesMatrix.addRolePlaceholder')}
              className="flex-1"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addCustomRole}>
              {t('rolesMatrix.addRoleButton')}
            </Button>
          </div>
          {cell.subjectKind === 'collection' && (
            <label className="flex items-center gap-2 font-sans text-sm text-foreground">
              <input
                type="checkbox"
                checked={own}
                onChange={(event) => setOwn(event.target.checked)}
              />
              {t('rolesMatrix.ownLabel')}
            </label>
          )}
        </div>
      )}

      {step === 'confirmSet' && (
        <PermissionDiff
          beforeRoles={current.roles}
          beforeOwn={current.own}
          afterRoles={selectedRoles}
          afterOwn={cell.subjectKind === 'collection' ? own : false}
          showOwn={cell.subjectKind === 'collection'}
        />
      )}

      {step === 'confirmReset' && (
        <>
          <p className="m-0 text-sm text-muted-foreground">
            {t('rolesMatrix.resetConfirmDescription')}
          </p>
          <PermissionDiff
            beforeRoles={current.roles}
            beforeOwn={current.own}
            afterRoles={cell.fileRule.roles}
            afterOwn={cell.fileRule.own}
            showOwn={cell.subjectKind === 'collection'}
          />
        </>
      )}
    </Modal>
  )
}

function PermissionDiff({
  beforeRoles,
  beforeOwn,
  afterRoles,
  afterOwn,
  showOwn,
}: {
  readonly beforeRoles: readonly string[]
  readonly beforeOwn: boolean
  readonly afterRoles: readonly string[]
  readonly afterOwn: boolean
  readonly showOwn: boolean
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {t('rolesMatrix.diffBefore')}
        </span>
        <span className="text-sm">
          {beforeRoles.length === 0 ? t('rolesMatrix.noRolesSelected') : beforeRoles.join(', ')}
        </span>
        {showOwn && beforeOwn && <span className="text-xs text-muted-foreground">(own)</span>}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {t('rolesMatrix.diffAfter')}
        </span>
        <span className="text-sm">
          {afterRoles.length === 0 ? t('rolesMatrix.noRolesSelected') : afterRoles.join(', ')}
        </span>
        {showOwn && afterOwn && <span className="text-xs text-muted-foreground">(own)</span>}
      </div>
    </div>
  )
}
