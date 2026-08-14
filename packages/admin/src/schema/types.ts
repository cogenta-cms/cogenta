/**
 * The admin's own copy of the shapes `/api/schema` returns.
 *
 * Deliberately not imported from `@cogenta/schema`: "the admin never imports
 * the schema modules, it is a browser application" is that package's own
 * documented reason `generate-schema-json.ts` exists at all — JSON is the
 * seam, and a browser bundle depending on a package built for Node code
 * (collection files can import anything) is the exact mistake that seam
 * exists to prevent.
 */

export type ContentAction = 'read' | 'create' | 'update' | 'delete' | 'publish'

export type CollectionPermissions = Readonly<Partial<Record<ContentAction, readonly string[]>>>

export interface CollectionSummary {
  readonly name: string
  readonly labels: { readonly singular: string; readonly plural: string }
  readonly permissions: CollectionPermissions
}

export interface SchemaDocument {
  readonly contract: string
  readonly collections: readonly CollectionSummary[]
}
