import { type SchemaIssue, schemaError } from './errors.js'
import { CONTENT_ACTIONS, type CollectionDefinition, type TaxonomyDefinition } from './types.js'

/**
 * `defineTaxonomy` is the second door into the content model (ADR-0022).
 *
 * It checks eagerly, at import time, for the same reason `defineCollection`
 * does: tables, admin screens and the term store are all derived from what is
 * declared here, and a mistake caught now costs a restart rather than a
 * database.
 *
 * A taxonomy is deliberately *thin*. It declares no fields: a term is `id`,
 * `parent`, `slug`, `position` and locale-indexed `labels`, and nothing else.
 * Anything richer than that is content, and content is a collection.
 */

/** Table-safe: the taxonomy name becomes an identifier on three dialects. */
const TAXONOMY_NAME_PATTERN = /^[a-z][a-z0-9_]*$/

/** BCP 47 enough for a key: `fr`, `en-GB`, `zh-Hant`. */
const LOCALE_PATTERN = /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{2,8})*$/

const ACTION_SET: ReadonlySet<string> = new Set(CONTENT_ACTIONS)

export function defineTaxonomy<const TDefinition extends TaxonomyDefinition>(
  definition: TDefinition,
): TDefinition {
  const issues = collectIssues(definition)
  if (issues.length > 0) {
    throw schemaError(definition.name ?? '(unnamed)', issues)
  }
  return definition
}

function collectIssues(definition: TaxonomyDefinition): SchemaIssue[] {
  const issues: SchemaIssue[] = []

  if (typeof definition.name !== 'string' || !TAXONOMY_NAME_PATTERN.test(definition.name)) {
    issues.push({
      path: 'name',
      message: 'must be a lowercase identifier such as "category" or "product_type"',
    })
  }

  checkLabels('labels.singular', definition.labels?.singular, true, issues)
  checkLabels('labels.plural', definition.labels?.plural, false, issues)
  checkPermissions(definition, issues)

  return issues
}

/**
 * Labels are indexed by locale, and that indexing is checked.
 *
 * A `{ singular: 'Catégorie' }` written by hand instead of
 * `{ singular: { fr: 'Catégorie' } }` would type-check nowhere and fail here
 * with the reason spelled out, rather than showing "[object Object]" in the
 * admin much later.
 */
function checkLabels(
  path: string,
  labels: Readonly<Record<string, string>> | undefined,
  required: boolean,
  issues: SchemaIssue[],
): void {
  if (labels === undefined) {
    if (required) issues.push({ path, message: 'is required, indexed by locale' })
    return
  }

  if (typeof labels !== 'object' || Array.isArray(labels)) {
    issues.push({ path, message: "must be indexed by locale, e.g. { fr: 'Catégorie' }" })
    return
  }

  const entries = Object.entries(labels)
  if (required && entries.length === 0) {
    issues.push({ path, message: 'needs a label in at least one locale' })
  }

  for (const [locale, label] of entries) {
    if (!LOCALE_PATTERN.test(locale)) {
      issues.push({
        path: `${path}.${locale}`,
        message: 'is not a locale tag such as "fr" or "en"',
      })
    }
    if (typeof label !== 'string' || label === '') {
      issues.push({ path: `${path}.${locale}`, message: 'must be a non-empty label' })
    }
  }
}

function checkPermissions(definition: TaxonomyDefinition, issues: SchemaIssue[]): void {
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
    // The action vocabulary stays frozen (ADR-0022) rather than growing a
    // taxonomy-shaped sixth verb — but a term is never published, so granting
    // `publish` on one would describe an operation that does not exist.
    if (action === 'publish') {
      issues.push({
        path: 'permissions.publish',
        message: 'a term is never published; use read, create, update and delete',
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

/**
 * Cross-object checks no single call can make: a `taxonomy` field only knows
 * the *name* of the taxonomy it points at, exactly as a `relation` only knows
 * the name of its collection.
 */
export function validateTaxonomySet(
  taxonomies: readonly TaxonomyDefinition[],
  collections: readonly CollectionDefinition[] = [],
): void {
  const names = new Set<string>()
  for (const taxonomy of taxonomies) {
    if (names.has(taxonomy.name)) {
      throw schemaError(taxonomy.name, [
        { path: 'name', message: 'two taxonomies share this name' },
      ])
    }
    names.add(taxonomy.name)
  }

  for (const collection of collections) {
    const issues: SchemaIssue[] = []
    for (const [field, definition] of Object.entries(collection.fields)) {
      if (definition.kind !== 'taxonomy') continue
      const target = String(definition.options['of'])
      if (!names.has(target)) {
        issues.push({
          path: `fields.${field}.of`,
          message: `points at "${target}", which no taxonomy defines`,
        })
      }
    }
    if (issues.length > 0) throw schemaError(collection.name, issues)
  }
}
