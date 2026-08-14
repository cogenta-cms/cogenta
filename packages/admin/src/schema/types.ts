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

export type CollectionPermissions = Readonly<Partial<Record<ContentAction, readonly string[]>>>

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
}

export interface SchemaSite {
  readonly locales: readonly string[]
  readonly defaultLocale: string
}

export interface SchemaDocument {
  readonly contract: string
  readonly collections: readonly CollectionSummary[]
  /** Absent when the server has no locales configured beyond the default (or is too old to send it). */
  readonly site?: SchemaSite
}
