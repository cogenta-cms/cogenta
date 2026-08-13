/**
 * The shapes the content engine is built on.
 *
 * This file is the seam between `@cogenta/schema`, `@cogenta/blocks` and
 * `@cogenta/api`: it declares what a field and a collection *are*, so the three
 * packages can be built against the same shapes rather than against each other.
 *
 * It implements contract A, frozen at `schema@1.0` on 2026-08-13. Every
 * departure from the contract text is a bug in this file, not a liberty.
 */

/** Contract A, "Types de champ (v1)". Closed set: adding one is a minor version. */
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

/** Contract A, "Permissions". Actions are fixed; role names are an open set. */
export const CONTENT_ACTIONS = ['read', 'create', 'update', 'delete', 'publish'] as const

export type ContentAction = (typeof CONTENT_ACTIONS)[number]

export const CONTENT_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const

export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const PROVENANCE_KINDS = ['human', 'assisted', 'generated'] as const

export type Provenance = (typeof PROVENANCE_KINDS)[number]

/** What the admin needs to render a field, and nothing the engine needs. */
export interface FieldAdminOptions {
  readonly label?: string
  readonly help?: string
  readonly group?: string
  /** Show this field only when another field holds a given value. */
  readonly showWhen?: { readonly field: string; readonly equals: unknown }
}

export interface BaseFieldOptions {
  readonly required?: boolean
  readonly default?: unknown
  /**
   * Declares that this field is translated.
   *
   * **Not a storage directive** (ADR-0014): content is stored one entry per
   * locale. This tells the admin the field is worth translating, so it can
   * offer to copy it from the source entry.
   */
  readonly localized?: boolean
  readonly unique?: boolean
  readonly validate?: (value: unknown) => true | string
  readonly admin?: FieldAdminOptions
}

/** What happens to a referencing row when the target is deleted. */
export type OnDelete = 'restrict' | 'cascade' | 'setNull'

export interface FieldDefinition extends BaseFieldOptions {
  readonly kind: FieldKind
  /** Kind-specific settings: `max`, `to`, `many`, `accept`, `options`, `from`… */
  readonly options: Readonly<Record<string, unknown>>
}

export interface CollectionRouting {
  readonly pattern: string
  /** Prefix the route with the locale. */
  readonly locale?: boolean
}

export interface CollectionVersioning {
  readonly drafts?: boolean
  readonly history?: boolean
  /** Versions kept per entry. Unlimited history is a slow leak, not a feature. */
  readonly keep?: number
}

export type CollectionPermissions = Readonly<Partial<Record<ContentAction, readonly string[]>>>

export interface CollectionDefinition {
  readonly name: string
  readonly labels: { readonly singular: string; readonly plural: string }
  readonly routing?: CollectionRouting
  readonly versioning?: CollectionVersioning
  readonly fields: Readonly<Record<string, FieldDefinition>>
  readonly indexes?: readonly (readonly string[])[]
  readonly permissions: CollectionPermissions
}

/**
 * Contract A, "Champs système". Present on every entry, never declared by the
 * user, never optional — `provenance` least of all: the European AI framework
 * requires it, so it exists from the first migration.
 */
export interface SystemFields {
  readonly id: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly createdBy: string | null
  readonly updatedBy: string | null
  readonly status: ContentStatus
  readonly locale: string
  readonly translationOf: string | null
  readonly version: number
  readonly provenance: Provenance
  readonly provenanceDetail: {
    readonly agent?: string
    readonly model?: string
    readonly at?: string
    readonly prompt?: string
  } | null
}
