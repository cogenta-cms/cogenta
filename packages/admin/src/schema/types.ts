/**
 * The admin's own copy of the shapes `/api/schema` returns.
 *
 * Deliberately not imported from `@cogenta/schema`: "the admin never imports
 * the schema modules, it is a browser application" is that package's own
 * documented reason `generate-schema-json.ts` exists at all — JSON is the
 * seam, and a browser bundle depending on a package built for Node code
 * (collection files can import anything) is the exact mistake that seam
 * exists to prevent. Field and kind shapes below mirror
 * `SchemaDocumentField`/`FIELD_KINDS` there; keep the two in sync by hand.
 */

export type ContentAction = 'read' | 'create' | 'update' | 'delete' | 'publish'

/**
 * One action's grant. The object form adds `own: true` (`schema@2.1`,
 * ADR-0027) — "this role may act on its own entries only" — the plain array
 * form is what a pre-2.1 server always sent, and stays valid: additive, not
 * a breaking shape change.
 */
export type CollectionPermissionRule =
  | readonly string[]
  | { readonly roles: readonly string[]; readonly own?: boolean }

export type CollectionPermissions = Readonly<
  Partial<Record<ContentAction, CollectionPermissionRule>>
>

/** `CollectionPermissionRule`, always read back out as `{ roles, own }`. Mirrors `@cogenta/schema`'s own helper. */
export function normalisePermissionRule(rule: CollectionPermissionRule | undefined): {
  readonly roles: readonly string[]
  readonly own: boolean
} {
  if (rule === undefined) return { roles: [], own: false }
  if (Array.isArray(rule)) return { roles: rule, own: false }
  const object = rule as { readonly roles: readonly string[]; readonly own?: boolean }
  return { roles: object.roles, own: object.own === true }
}

export const FIELD_KINDS = [
  'text',
  'richText',
  'slug',
  'number',
  'boolean',
  'date',
  'datetime',
  'media',
  'relation',
  'select',
  'json',
  'geo',
  'color',
  'blocks',
  'taxonomy',
] as const

export type FieldKind = (typeof FIELD_KINDS)[number]

export interface FieldAdminMeta {
  readonly label?: string
  readonly help?: string
  readonly group?: string
  readonly showWhen?: { readonly field: string; readonly equals: unknown }
}

export interface SchemaField {
  readonly name: string
  readonly kind: FieldKind
  readonly required: boolean
  readonly localized: boolean
  readonly unique: boolean
  readonly hasCustomValidation: boolean
  readonly default?: unknown
  readonly admin?: FieldAdminMeta
  /** Kind-specific: `min`/`max` for text and number, `options` for select, `accept` for media… */
  readonly options: Readonly<Record<string, unknown>>
}

export interface CollectionRouting {
  readonly pattern: string
  /** Whether the route carries a locale prefix (ADR-0014's translation family). */
  readonly locale?: boolean
}

export interface CollectionSummary {
  readonly name: string
  readonly labels: { readonly singular: string; readonly plural: string }
  readonly permissions: CollectionPermissions
  readonly fields: readonly SchemaField[]
  readonly routing?: CollectionRouting
  /**
   * The trash window, or `false` when this collection deletes outright
   * (`schema@2.0`, ADR-0022). Optional here rather than required: a server
   * older than 2.0 does not send it, and the admin must still start.
   */
  readonly trash?: { readonly retainDays: number } | false
  /**
   * The editorial workflow, opt-in per collection (`schema@2.1`, ADR-0027).
   * Absent — a server older than 2.1, or a collection that never turned it
   * on — means "no workflow": the review queue and the editor's workflow
   * controls show nothing for it.
   */
  readonly workflow?: { readonly enabled: boolean }
}

/** A taxonomy as `/api/schema` describes it (`schema@2.0`, ADR-0022). */
export interface TaxonomySummary {
  readonly name: string
  readonly labels: {
    readonly singular: Readonly<Record<string, string>>
    readonly plural?: Readonly<Record<string, string>>
  }
  readonly hierarchical: boolean
  readonly permissions: CollectionPermissions
}

export interface SchemaSite {
  readonly locales: readonly string[]
  readonly defaultLocale: string
}

export interface SchemaDocument {
  readonly contract: string
  readonly collections: readonly CollectionSummary[]
  /** Absent from a pre-2.0 server; treated as "no taxonomies" rather than as an error. */
  readonly taxonomies?: readonly TaxonomySummary[]
  /** Absent when the server has no locales configured beyond the default (or is too old to send it). */
  readonly site?: SchemaSite
}
