import type { TFunction } from 'i18next'
import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { getCommercePermissions } from '../api/commerce-client.js'
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
import type { CollectionSummary, ContentAction, TaxonomySummary } from '../schema/types.js'
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
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
 * Fiche 19, tasks 1-3 — the permission matrix WordPress ships behind a
 * plugin and Cogenta has never shipped at all. **Read-only, entirely**
 * (fiche's own §3, option (a)): a role's grants live in `cogenta.schema.*`,
 * which is code, reviewed and deployed like any other (ADR-0010) — this
 * screen renders what that file already says, never a second place that
 * could disagree with it. Writing permissions from here (task 4) and an
 * `own: true` per-entry clause (task 5) are both explicitly out of this
 * screen's scope, pending the ADR the fiche itself requires before either is
 * built.
 *
 * Everything on this page is computed from the schema `/api/schema` actually
 * serves plus the accounts `/api/users` actually holds — never a hardcoded
 * description of what a "normal" site looks like. A custom role, a
 * collection with no routing, a taxonomy nobody uses: all real inputs, none
 * of them special-cased away.
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const [users, commercePermissions] = await Promise.all([
        listUsers(token),
        getCommercePermissions(token),
      ])
      const usage: Record<string, number> = {}
      for (const user of users) {
        for (const role of user.roles) usage[role] = (usage[role] ?? 0) + 1
      }
      setRoleUsage(usage)
      setCommerce(commercePermissions)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('rolesMatrix.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

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

function ByCollectionMatrix({
  collections,
  taxonomies,
  locale,
}: {
  readonly collections: readonly CollectionSummary[]
  readonly taxonomies: readonly TaxonomySummary[]
  readonly locale: string
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
                <TableCell key={action} className="text-sm">
                  {(collection.permissions[action] ?? []).join(', ') || '—'}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {taxonomies.map((taxonomy) => (
            <TableRow key={`taxonomy-${taxonomy.name}`}>
              <TableCell className="font-medium">
                {taxonomyLabel(taxonomy, locale)}
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('rolesMatrix.taxonomyBadge')}
                </span>
              </TableCell>
              {ALL_CONTENT_ACTIONS.map((action) => (
                <TableCell key={action} className="text-sm">
                  {(taxonomy.permissions[action] ?? []).join(', ') || '—'}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableRoot>
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
