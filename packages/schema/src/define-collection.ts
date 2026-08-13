import { type SchemaIssue, schemaError } from './errors.js'
import { MEDIA_ACCEPT_KINDS } from './fields.js'
import { isSystemFieldName } from './system-fields.js'
import {
  CONTENT_ACTIONS,
  type CollectionDefinition,
  FIELD_KINDS,
  type FieldDefinition,
} from './types.js'
import { fieldSchema } from './validation.js'

/**
 * `defineCollection` is the only door into the content model.
 *
 * It checks the definition eagerly, at import time, because everything
 * downstream — types, migrations, admin, API — is generated from it. A schema
 * mistake caught here costs a restart; the same mistake caught at migration
 * time costs a database.
 */

/** Table-safe: the collection name becomes an identifier on three dialects. */
const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9_]*$/

/** Property-safe: the field name becomes a TypeScript property and a column. */
const FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

const ROUTE_PARAMETER_PATTERN = /:([a-zA-Z_][a-zA-Z0-9_]*)/g

const INDEX_DIRECTIONS: ReadonlySet<string> = new Set(['asc', 'desc'])

const ACTION_SET: ReadonlySet<string> = new Set(CONTENT_ACTIONS)

const KIND_SET: ReadonlySet<string> = new Set(FIELD_KINDS)

const ACCEPT_SET: ReadonlySet<string> = new Set(MEDIA_ACCEPT_KINDS)

export function defineCollection<const TDefinition extends CollectionDefinition>(
  definition: TDefinition,
): TDefinition {
  const issues = collectIssues(definition)
  if (issues.length > 0) {
    throw schemaError(definition.name ?? '(unnamed)', issues)
  }
  return definition
}

function collectIssues(definition: CollectionDefinition): SchemaIssue[] {
  const issues: SchemaIssue[] = []

  if (typeof definition.name !== 'string' || !COLLECTION_NAME_PATTERN.test(definition.name)) {
    issues.push({
      path: 'name',
      message: 'must be a lowercase identifier such as "article" or "blog_post"',
    })
  }

  if (definition.labels?.singular === undefined || definition.labels.singular === '') {
    issues.push({ path: 'labels.singular', message: 'is required' })
  }
  if (definition.labels?.plural === undefined || definition.labels.plural === '') {
    issues.push({ path: 'labels.plural', message: 'is required' })
  }

  const fields = definition.fields
  const fieldNames = fields === undefined ? [] : Object.keys(fields)
  if (fieldNames.length === 0) {
    issues.push({ path: 'fields', message: 'a collection needs at least one field' })
  }

  for (const name of fieldNames) {
    checkField(name, fields[name], fieldNames, issues)
  }

  checkRouting(definition, fieldNames, issues)
  checkIndexes(definition, fieldNames, issues)
  checkPermissions(definition, issues)
  checkVersioning(definition, issues)

  return issues
}

function checkField(
  name: string,
  field: FieldDefinition | undefined,
  fieldNames: readonly string[],
  issues: SchemaIssue[],
): void {
  const path = `fields.${name}`

  if (!FIELD_NAME_PATTERN.test(name)) {
    issues.push({ path, message: 'field name must be a valid identifier' })
  }

  // A collection cannot redeclare a system field: the runtime owns `status`,
  // `locale` and `provenance`, and a shadowing column would be written twice
  // with different meanings.
  if (isSystemFieldName(name)) {
    issues.push({ path, message: `"${name}" is a system field and cannot be redeclared` })
    return
  }

  if (field === undefined || typeof field !== 'object' || !KIND_SET.has(field.kind)) {
    issues.push({ path, message: 'must be built with an `f.*` constructor' })
    return
  }

  switch (field.kind) {
    case 'relation':
      checkRelation(path, field, issues)
      break
    case 'select':
      checkSelect(path, field, issues)
      break
    case 'slug':
      checkSlug(path, field, fieldNames, issues)
      break
    case 'media':
      checkMedia(path, field, issues)
      break
    case 'blocks':
      checkBlocks(path, field, issues)
      break
    default:
      break
  }

  const showWhen = field.admin?.showWhen
  if (showWhen !== undefined && !fieldNames.includes(showWhen.field)) {
    issues.push({
      path: `${path}.admin.showWhen.field`,
      message: `refers to "${showWhen.field}", which this collection does not declare`,
    })
  }

  checkDefault(path, field, issues)
}

function checkRelation(path: string, field: FieldDefinition, issues: SchemaIssue[]): void {
  const to = field.options.to
  if (typeof to !== 'string' || to === '') {
    issues.push({ path: `${path}.to`, message: 'a relation must name the collection it points to' })
  }

  // Contract A: `'setNull'` only makes sense on a to-one, non-required
  // relation. Anywhere else it describes an impossible row.
  if (field.options.onDelete === 'setNull') {
    if (field.options.many === true) {
      issues.push({
        path: `${path}.onDelete`,
        message: "'setNull' is meaningless on a to-many relation; use 'cascade' or 'restrict'",
      })
    }
    if (field.required === true) {
      issues.push({
        path: `${path}.onDelete`,
        message: "'setNull' cannot apply to a required field, which may never be null",
      })
    }
  }
}

function checkSelect(path: string, field: FieldDefinition, issues: SchemaIssue[]): void {
  const options = field.options.options
  if (!Array.isArray(options) || options.length === 0) {
    issues.push({ path: `${path}.options`, message: 'a select needs at least one option' })
    return
  }

  const seen = new Set<string>()
  for (const choice of options) {
    const value =
      typeof choice === 'object' && choice !== null && 'value' in choice
        ? String((choice as { value: unknown }).value)
        : String(choice)
    if (value === '') {
      issues.push({ path: `${path}.options`, message: 'an option value cannot be empty' })
    }
    if (seen.has(value)) {
      issues.push({ path: `${path}.options`, message: `duplicate option value "${value}"` })
    }
    seen.add(value)
  }
}

function checkSlug(
  path: string,
  field: FieldDefinition,
  fieldNames: readonly string[],
  issues: SchemaIssue[],
): void {
  const from = field.options.from
  if (from !== undefined && !fieldNames.includes(String(from))) {
    issues.push({
      path: `${path}.from`,
      message: `refers to "${String(from)}", which this collection does not declare`,
    })
  }
}

function checkMedia(path: string, field: FieldDefinition, issues: SchemaIssue[]): void {
  const accept = field.options.accept
  if (!Array.isArray(accept) || accept.length === 0) {
    issues.push({ path: `${path}.accept`, message: 'must accept at least one kind of media' })
    return
  }
  for (const kind of accept) {
    if (!ACCEPT_SET.has(String(kind))) {
      issues.push({
        path: `${path}.accept`,
        message: `unknown media kind "${String(kind)}"; expected one of ${[...ACCEPT_SET].join(', ')}`,
      })
    }
  }
}

function checkBlocks(path: string, field: FieldDefinition, issues: SchemaIssue[]): void {
  const allow = field.options.allow
  if (allow === '*') return
  if (!Array.isArray(allow) || allow.length === 0) {
    issues.push({
      path: `${path}.allow`,
      message: "must be '*' or a non-empty list of block names",
    })
    return
  }
  for (const name of allow) {
    if (typeof name !== 'string' || name === '') {
      issues.push({ path: `${path}.allow`, message: 'block names must be non-empty strings' })
    }
  }
}

/**
 * A default that the field itself would reject is a bug that only shows up the
 * first time an editor creates an entry — long after the schema was written.
 */
function checkDefault(path: string, field: FieldDefinition, issues: SchemaIssue[]): void {
  if (field.default === undefined) return

  const result = fieldSchema(field).safeParse(field.default)
  if (!result.success) {
    const reason = result.error.issues[0]?.message ?? 'is not a valid value for this field'
    issues.push({ path: `${path}.default`, message: `${reason} (default value)` })
  }
}

function checkRouting(
  definition: CollectionDefinition,
  fieldNames: readonly string[],
  issues: SchemaIssue[],
): void {
  const routing = definition.routing
  if (routing === undefined) return

  if (typeof routing.pattern !== 'string' || !routing.pattern.startsWith('/')) {
    issues.push({ path: 'routing.pattern', message: 'must start with "/"' })
    return
  }

  for (const match of routing.pattern.matchAll(ROUTE_PARAMETER_PATTERN)) {
    const parameter = match[1]
    if (parameter === undefined) continue
    // `:locale` is served by the system field of the same name; anything else
    // has to come from a declared field, or the route can never be built.
    if (parameter === 'locale' || fieldNames.includes(parameter)) continue
    issues.push({
      path: 'routing.pattern',
      message: `":${parameter}" does not match any field of this collection`,
    })
  }
}

function checkIndexes(
  definition: CollectionDefinition,
  fieldNames: readonly string[],
  issues: SchemaIssue[],
): void {
  const indexes = definition.indexes
  if (indexes === undefined) return

  for (const [position, index] of indexes.entries()) {
    const path = `indexes[${position}]`
    if (!Array.isArray(index) || index.length === 0) {
      issues.push({ path, message: 'an index needs at least one field' })
      continue
    }

    for (const [column, entry] of index.entries()) {
      // The contract writes a direction as the last element: ['publishedAt', 'desc'].
      const isTrailingDirection = column === index.length - 1 && INDEX_DIRECTIONS.has(entry)
      if (isTrailingDirection) continue
      if (fieldNames.includes(entry) || isSystemFieldName(entry)) continue
      issues.push({
        path,
        message: `"${entry}" is neither a field of this collection nor a system field`,
      })
    }
  }
}

function checkPermissions(definition: CollectionDefinition, issues: SchemaIssue[]): void {
  const permissions = definition.permissions
  if (permissions === undefined || typeof permissions !== 'object') {
    issues.push({ path: 'permissions', message: 'is required' })
    return
  }

  for (const [action, roles] of Object.entries(permissions)) {
    if (!ACTION_SET.has(action)) {
      issues.push({
        path: `permissions.${action}`,
        message: `unknown action; the fixed set is ${CONTENT_ACTIONS.join(', ')}`,
      })
      continue
    }
    if (!Array.isArray(roles)) {
      issues.push({ path: `permissions.${action}`, message: 'must be a list of role names' })
      continue
    }
    for (const role of roles) {
      if (typeof role !== 'string' || role === '') {
        issues.push({
          path: `permissions.${action}`,
          message: 'role names must be non-empty strings',
        })
      }
    }
  }
}

function checkVersioning(definition: CollectionDefinition, issues: SchemaIssue[]): void {
  const keep = definition.versioning?.keep
  if (keep === undefined) return
  if (!Number.isInteger(keep) || keep < 1) {
    issues.push({ path: 'versioning.keep', message: 'must be a positive whole number of versions' })
  }
}

/**
 * Cross-collection checks, which no single `defineCollection` call can make:
 * a relation only knows the *name* of its target.
 */
export function validateCollectionSet(collections: readonly CollectionDefinition[]): void {
  const names = new Set<string>()
  for (const collection of collections) {
    if (names.has(collection.name)) {
      throw schemaError(collection.name, [
        { path: 'name', message: 'two collections share this name' },
      ])
    }
    names.add(collection.name)
  }

  for (const collection of collections) {
    const issues: SchemaIssue[] = []
    for (const [name, field] of Object.entries(collection.fields)) {
      if (field.kind !== 'relation') continue
      const target = String(field.options.to)
      if (!names.has(target)) {
        issues.push({
          path: `fields.${name}.to`,
          message: `points at "${target}", which no collection defines`,
        })
      }
    }
    if (issues.length > 0) throw schemaError(collection.name, issues)
  }
}
