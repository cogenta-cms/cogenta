import { validateCollectionSet } from './define-collection.js'
import { SYSTEM_FIELD_DESCRIPTORS, type SystemFieldDescriptor } from './system-fields.js'
import type {
  CollectionDefinition,
  CollectionPermissions,
  CollectionRouting,
  CollectionVersioning,
  FieldDefinition,
  FieldKind,
} from './types.js'
import type { JsonValue } from './validation.js'

/**
 * Renders `.cogenta/schema.json`, the description the admin reads to build its
 * interface (L1 § "Génération").
 *
 * The admin never imports the schema modules: it is a browser application, and
 * a collection file is Node code that may import anything. JSON is the seam.
 * Which is also why a `validate` function cannot cross it — only the fact that
 * one exists does.
 */

export const SCHEMA_DOCUMENT_CONTRACT = 'schema@1.0'

export interface SchemaDocumentField {
  readonly name: string
  readonly kind: FieldKind
  readonly required: boolean
  readonly localized: boolean
  readonly unique: boolean
  /** The function itself cannot be serialised; the admin still needs to know. */
  readonly hasCustomValidation: boolean
  readonly default?: JsonValue
  readonly admin?: SchemaDocumentAdmin
  readonly options: Record<string, JsonValue>
}

export interface SchemaDocumentAdmin {
  readonly label?: string
  readonly help?: string
  readonly group?: string
  readonly showWhen?: { readonly field: string; readonly equals: JsonValue }
}

export interface SchemaDocumentCollection {
  readonly name: string
  readonly labels: { readonly singular: string; readonly plural: string }
  readonly routing?: CollectionRouting
  readonly versioning?: CollectionVersioning
  readonly indexes: readonly (readonly string[])[]
  readonly permissions: CollectionPermissions
  readonly fields: readonly SchemaDocumentField[]
}

export interface SchemaDocumentSite {
  readonly locales: readonly string[]
  readonly defaultLocale: string
}

export interface SchemaDocument {
  readonly contract: typeof SCHEMA_DOCUMENT_CONTRACT
  readonly systemFields: readonly SystemFieldDescriptor[]
  readonly collections: readonly SchemaDocumentCollection[]
  /** Absent for the build-time `.cogenta/schema.json` (no config in scope there) — present when a live server serves `/api/schema`. */
  readonly site?: SchemaDocumentSite
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

export function buildSchemaDocument(
  collections: readonly CollectionDefinition[],
  site?: SchemaDocumentSite,
): SchemaDocument {
  validateCollectionSet(collections)

  const sorted = [...collections].sort((left, right) => (left.name < right.name ? -1 : 1))

  return {
    contract: SCHEMA_DOCUMENT_CONTRACT,
    systemFields: SYSTEM_FIELD_DESCRIPTORS,
    collections: sorted.map(describeCollection),
    ...(site === undefined ? {} : { site }),
  }
}

/** Trailing newline: the file is written to disk and read by humans in diffs. */
export function renderSchemaJson(collections: readonly CollectionDefinition[]): string {
  return `${JSON.stringify(buildSchemaDocument(collections), null, 2)}\n`
}

function describeCollection(collection: CollectionDefinition): SchemaDocumentCollection {
  const described: Mutable<SchemaDocumentCollection> = {
    name: collection.name,
    labels: collection.labels,
    indexes: collection.indexes ?? [],
    permissions: collection.permissions,
    fields: Object.entries(collection.fields).map(([name, field]) => describeField(name, field)),
  }
  if (collection.routing !== undefined) described.routing = collection.routing
  if (collection.versioning !== undefined) described.versioning = collection.versioning
  return described
}

function describeField(name: string, field: FieldDefinition): SchemaDocumentField {
  const described: Mutable<SchemaDocumentField> = {
    name,
    kind: field.kind,
    // Spelled out rather than left absent: the admin renders every flag, and a
    // missing key would force it to re-derive the defaults of the contract.
    required: field.required === true,
    localized: field.localized === true,
    unique: field.unique === true,
    hasCustomValidation: field.validate !== undefined,
    options: describeOptions(field.options),
  }

  const defaultValue = toJsonValue(field.default)
  if (defaultValue !== undefined) described.default = defaultValue

  const admin = describeAdmin(field)
  if (admin !== undefined) described.admin = admin

  return described
}

function describeAdmin(field: FieldDefinition): SchemaDocumentAdmin | undefined {
  const admin = field.admin
  if (admin === undefined) return undefined

  const described: Mutable<SchemaDocumentAdmin> = {}
  if (admin.label !== undefined) described.label = admin.label
  if (admin.help !== undefined) described.help = admin.help
  if (admin.group !== undefined) described.group = admin.group
  if (admin.showWhen !== undefined) {
    described.showWhen = {
      field: admin.showWhen.field,
      equals: toJsonValue(admin.showWhen.equals) ?? null,
    }
  }
  return described
}

function describeOptions(options: Readonly<Record<string, unknown>>): Record<string, JsonValue> {
  const described: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(options)) {
    const json = toJsonValue(value)
    if (json !== undefined) described[key] = json
  }
  return described
}

/**
 * Keeps what survives a JSON round-trip and drops the rest.
 *
 * A schema may legitimately hold a `validate` function or a `Date` default;
 * neither can reach the admin. Dropping them here is honest — writing
 * `"default": {}` for a `Date` would not be.
 */
function toJsonValue(value: unknown, seen: ReadonlySet<object> = new Set()): JsonValue | undefined {
  if (value === null) return null
  switch (typeof value) {
    case 'string':
      return value
    case 'number':
      return Number.isFinite(value) ? value : undefined
    case 'boolean':
      return value
    case 'object':
      break
    default:
      return undefined
  }

  const object = value as object
  // A schema file is authored by hand, but nothing stops a default from holding
  // a cycle, and JSON.stringify would throw at write time instead of here.
  if (seen.has(object)) return undefined
  const nested = new Set(seen).add(object)

  if (Array.isArray(object)) {
    return object.map((entry) => toJsonValue(entry, nested) ?? null)
  }

  const plain: Record<string, JsonValue> = {}
  for (const [key, entry] of Object.entries(object)) {
    const json = toJsonValue(entry, nested)
    if (json !== undefined) plain[key] = json
  }
  return plain
}
