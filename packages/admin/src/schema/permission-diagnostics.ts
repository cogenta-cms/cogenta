import { knownRoleNames, PUBLIC_ROLE, taxonomyLabel } from './permissions.js'
import type { CollectionPermissions, ContentAction, SchemaDocument } from './types.js'

/**
 * Fiche 19 task 3 — the diagnostics section, described as "la partie la plus
 * utile". Every check here reads the schema `/api/schema` actually served
 * (plus, for the two role checks, which roles accounts on this site actually
 * hold) — never a hardcoded assumption about what a "normal" site looks like.
 */

const WRITE_ACTIONS: readonly ContentAction[] = ['create', 'update', 'delete', 'publish']

export type PermissionAnomalyKind =
  | 'unreadable'
  | 'publicWrite'
  | 'unknownRoleInUse'
  | 'unusedRole'
  | 'routedNotPublic'

export type PermissionAnomalySeverity = 'high' | 'medium' | 'low'

export interface PermissionAnomaly {
  readonly kind: PermissionAnomalyKind
  readonly severity: PermissionAnomalySeverity
  readonly subjectKind: 'collection' | 'taxonomy' | 'role'
  /** The collection/taxonomy/role name, stable and untranslated — a React `key` and a lookup value. */
  readonly subject: string
  /** Human label for the subject — the collection's plural label, the taxonomy's, or the role name itself. */
  readonly label: string
  /** Present only for `publicWrite`: which write actions are open to `public`. */
  readonly actions?: readonly ContentAction[]
  /** Present only for the two role checks: how many accounts on this site hold this role. */
  readonly accountCount?: number
}

function subjectAnomalies(
  subjectKind: 'collection' | 'taxonomy',
  name: string,
  label: string,
  permissions: CollectionPermissions,
  routed: boolean,
): PermissionAnomaly[] {
  const anomalies: PermissionAnomaly[] = []
  const readRoles = permissions.read ?? []

  if (readRoles.length === 0) {
    // Invisible to everyone, including `admin` — `canPerform` denies an
    // action nobody is named for, no exception. This is the anomaly with
    // nothing softer to say about it: an empty `read` is never intentional,
    // because the one always-correct way to make something admin-only is to
    // name `admin`, not to name nobody.
    anomalies.push({ kind: 'unreadable', severity: 'high', subjectKind, subject: name, label })
  } else if (routed && !readRoles.includes(PUBLIC_ROLE)) {
    // The exact shape of the L10 sitemap bug: a collection with a public
    // route (so `/sitemap.xml` and public pages try to read it) that is
    // nonetheless closed to the `public` role. Not necessarily wrong — a
    // routed-but-gated collection is a real pattern (a members' area) — but
    // worth a look, since it silently drops the collection from the sitemap
    // and 404s every anonymous visitor who follows its link.
    anomalies.push({
      kind: 'routedNotPublic',
      severity: 'medium',
      subjectKind,
      subject: name,
      label,
    })
  }

  const publicWriteActions = WRITE_ACTIONS.filter((action) =>
    (permissions[action] ?? []).includes(PUBLIC_ROLE),
  )
  if (publicWriteActions.length > 0) {
    anomalies.push({
      kind: 'publicWrite',
      severity: 'high',
      subjectKind,
      subject: name,
      label,
      actions: publicWriteActions,
    })
  }

  return anomalies
}

/**
 * `roleUsage` is how many accounts on this site currently hold each role name
 * — computed by the caller from the full account list (`listUsers`), since
 * this module stays free of any network or auth dependency.
 */
export function diagnosePermissions(
  schema: Pick<SchemaDocument, 'collections' | 'taxonomies'>,
  roleUsage: Readonly<Record<string, number>>,
  locale: string,
): readonly PermissionAnomaly[] {
  const anomalies: PermissionAnomaly[] = []

  for (const collection of schema.collections) {
    anomalies.push(
      ...subjectAnomalies(
        'collection',
        collection.name,
        collection.labels.plural,
        collection.permissions,
        collection.routing !== undefined,
      ),
    )
  }

  for (const taxonomy of schema.taxonomies ?? []) {
    anomalies.push(
      ...subjectAnomalies(
        'taxonomy',
        taxonomy.name,
        taxonomyLabel(taxonomy, locale),
        taxonomy.permissions,
        false,
      ),
    )
  }

  const known = new Set(knownRoleNames(schema))

  for (const [role, count] of Object.entries(roleUsage)) {
    if (role === PUBLIC_ROLE || count <= 0) continue
    if (!known.has(role)) {
      anomalies.push({
        kind: 'unknownRoleInUse',
        severity: 'medium',
        subjectKind: 'role',
        subject: role,
        label: role,
        accountCount: count,
      })
    }
  }

  for (const role of known) {
    if ((roleUsage[role] ?? 0) === 0) {
      anomalies.push({
        kind: 'unusedRole',
        severity: 'low',
        subjectKind: 'role',
        subject: role,
        label: role,
      })
    }
  }

  return anomalies
}
