import { CogentaError } from '@cogenta/core'
import { type CollectionDefinition, SYSTEM_FIELD_NAMES } from '@cogenta/schema'

const OPERATORS = new Set(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in', 'contains', 'exists'])
const SYSTEM_FILTERS = new Set<string>([...SYSTEM_FIELD_NAMES, 'publishedAt'])

function invalid(key: string, reason: string): never {
  throw new CogentaError({
    code: 'BLOCK_INVALID',
    message: `The collection list "${key}" cannot be saved: ${reason}.`,
    hint: 'Choose a collection, sort field and filter supported by the current site schema.',
  })
}

/** Contract B's query data is validated against the current contract A schema before a write. */
export function assertCollectionListValid(
  key: string,
  data: Readonly<Record<string, unknown>>,
  collections: readonly CollectionDefinition[],
): void {
  const target = collections.find((collection) => collection.name === data.collection)
  if (target === undefined) invalid(key, `collection "${String(data.collection)}" does not exist`)
  if (typeof data.sort === 'object' && data.sort !== null) {
    const field = (data.sort as { field?: unknown }).field
    const declared = typeof field === 'string' ? target.fields[field] : undefined
    if (
      field !== 'id' &&
      field !== 'createdAt' &&
      field !== 'updatedAt' &&
      declared?.kind !== 'date' &&
      declared?.kind !== 'datetime'
    ) {
      invalid(key, `"${target.name}" cannot be sorted by "${String(field)}"`)
    }
  }
  if (typeof data.filter !== 'object' || data.filter === null) return
  for (const [name, raw] of Object.entries(data.filter)) {
    const field = target.fields[name]
    if (field === undefined && !SYSTEM_FILTERS.has(name))
      invalid(key, `filter field "${name}" does not exist on "${target.name}"`)
    if (field !== undefined && ['blocks', 'richText', 'geo', 'json'].includes(field.kind))
      invalid(key, `filter field "${name}" does not support typed comparisons`)
    let operator = 'eq'
    let value: unknown = raw
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const entries = Object.entries(raw)
      const single = entries.length === 1 ? entries[0] : undefined
      if (single !== undefined && OPERATORS.has(single[0])) [operator, value] = single
    }
    if (operator === 'exists') {
      if (typeof value !== 'boolean') invalid(key, `"${name}.exists" expects a boolean`)
      continue
    }
    if (operator === 'in' && !Array.isArray(value)) invalid(key, `"${name}.in" expects an array`)
    const kind = field?.kind ?? (name === 'version' ? 'number' : 'text')
    const items = operator === 'in' ? (value as readonly unknown[]) : [value]
    for (const item of items) {
      if (item === null) continue
      if (kind === 'number' && (typeof item !== 'number' || !Number.isFinite(item)))
        invalid(key, `"${name}" expects a number`)
      if (kind === 'boolean' && typeof item !== 'boolean')
        invalid(key, `"${name}" expects a boolean`)
      if (
        [
          'text',
          'slug',
          'color',
          'date',
          'datetime',
          'select',
          'media',
          'relation',
          'taxonomy',
        ].includes(kind) &&
        typeof item !== 'string' &&
        !(Array.isArray(item) && item.every((entry) => typeof entry === 'string'))
      )
        invalid(key, `"${name}" expects text or a list of text values`)
      if (
        typeof item === 'string' &&
        (item === '$now' || item === '$today') &&
        kind !== 'date' &&
        kind !== 'datetime' &&
        !['createdAt', 'updatedAt', 'publishedAt'].includes(name)
      )
        invalid(key, `relative time filter "${name}" needs a date field`)
    }
  }
}
