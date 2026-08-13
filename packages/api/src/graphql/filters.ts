import type { CollectionDefinition, FieldDefinition } from '@cogenta/schema'
import {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLID,
  GraphQLInputObjectType,
  type GraphQLInputType,
  GraphQLList,
  GraphQLNonNull,
  type GraphQLNullableInputType,
  GraphQLString,
} from 'graphql'
import type { FieldCondition, Filter, FilterOperator } from '../types.js'
import { interfaceNameOf } from './naming.js'
import { ContentStatusEnum, ProvenanceEnum } from './scalars.js'

/**
 * The filter vocabulary, rendered as GraphQL input types.
 *
 * It is exactly `FilterOperator` from the seam — equality, comparison, `in`,
 * `contains`, `exists`, and the `and`/`or` combinations — and nothing more. The
 * spec forbids exposing a home-grown query language, so this file has no escape
 * hatch: there is no `raw:`, no `where:` string, no operator that is not in the
 * closed list below. What GraphQL accepts is what REST accepts, because both
 * end up in the same `Filter`.
 */

const COMPARABLE = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'] as const
const OPERATORS: readonly FilterOperator[] = [...COMPARABLE, 'in', 'contains', 'exists']

function scalarFilter(name: string, type: GraphQLNullableInputType): GraphQLInputObjectType {
  return new GraphQLInputObjectType({
    name,
    fields: {
      ...Object.fromEntries(COMPARABLE.map((operator) => [operator, { type }])),
      in: { type: new GraphQLList(new GraphQLNonNull(type)) },
      contains: { type, description: 'Substring for text, membership for a list.' },
      exists: { type: GraphQLBoolean, description: 'True matches any non-null value.' },
    },
  })
}

export const StringFilterType = scalarFilter('StringFilter', GraphQLString)
export const FloatFilterType = scalarFilter('FloatFilter', GraphQLFloat)
export const BooleanFilterType = scalarFilter('BooleanFilter', GraphQLBoolean)
export const IDFilterType = scalarFilter('IDFilter', GraphQLID)
export const StatusFilterType = scalarFilter('ContentStatusFilter', ContentStatusEnum)
export const ProvenanceFilterType = scalarFilter('ProvenanceFilter', ProvenanceEnum)

/** The system fields every collection can be filtered on, in a fixed order. */
const SYSTEM_FILTERS: readonly (readonly [string, GraphQLInputObjectType])[] = [
  ['id', IDFilterType],
  ['status', StatusFilterType],
  ['locale', StringFilterType],
  ['translationOf', IDFilterType],
  ['createdAt', StringFilterType],
  ['updatedAt', StringFilterType],
  ['createdBy', IDFilterType],
  ['updatedBy', IDFilterType],
  ['version', FloatFilterType],
  ['provenance', ProvenanceFilterType],
]

/**
 * Returns null for a field that cannot be filtered.
 *
 * `richText`, `json`, `geo` and `blocks` are left out on purpose: none of them
 * has an ordering or an equality a user would predict, and offering one would
 * be the first stone of the query language the spec forbids. Full-text search
 * is a separate task (L1/16) with its own per-dialect engine.
 */
function filterTypeFor(field: FieldDefinition): GraphQLInputObjectType | null {
  switch (field.kind) {
    case 'text':
    case 'slug':
    case 'color':
    case 'date':
    case 'datetime':
    case 'select':
      return StringFilterType
    case 'number':
      return FloatFilterType
    case 'boolean':
      return BooleanFilterType
    case 'media':
    case 'relation':
      return IDFilterType
    default:
      return null
  }
}

export function filterInputFor(collection: CollectionDefinition): GraphQLInputObjectType {
  const name = `${interfaceNameOf(collection)}Filter`

  return new GraphQLInputObjectType({
    name,
    // A thunk: `and` and `or` refer to the type being defined.
    fields: () => {
      const fields: Record<string, { type: GraphQLInputType; description?: string }> = {}

      for (const [systemField, type] of SYSTEM_FILTERS) {
        if (collection.fields[systemField] === undefined) fields[systemField] = { type }
      }

      for (const [fieldName, field] of Object.entries(collection.fields)) {
        const type = filterTypeFor(field)
        if (type !== null) fields[fieldName] = { type }
      }

      const self = filterInputRegistry.get(name)
      if (self !== undefined) {
        fields['and'] = { type: new GraphQLList(new GraphQLNonNull(self)) }
        fields['or'] = { type: new GraphQLList(new GraphQLNonNull(self)) }
      }
      return fields
    },
  })
}

/**
 * Lets the thunk above name the type it is defining.
 *
 * `new GraphQLInputObjectType` has not returned yet when its own thunk runs, so
 * the reference has to come from somewhere; a registry keyed by the type name
 * is the least surprising somewhere.
 */
const filterInputRegistry = new Map<string, GraphQLInputObjectType>()

export function registerFilterInput(collection: CollectionDefinition): GraphQLInputObjectType {
  const name = `${interfaceNameOf(collection)}Filter`
  const existing = filterInputRegistry.get(name)
  if (existing !== undefined) return existing

  const type = filterInputFor(collection)
  filterInputRegistry.set(name, type)
  return type
}

type RawFilter = Readonly<Record<string, unknown>>

/**
 * Turns a coerced filter argument into the seam's `Filter`.
 *
 * Several operators on one field, and several fields in one object, are an
 * `and`: `{ title: { contains: "x" }, featured: { eq: true } }` reads the way
 * anyone would expect it to.
 */
export function toFilter(raw: unknown): Filter | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const input = raw as RawFilter
  const parts: Filter[] = []

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue

    if (key === 'and' || key === 'or') {
      if (!Array.isArray(value)) continue
      const children = value
        .map((child) => toFilter(child))
        .filter((child): child is Filter => child !== undefined)
      if (children.length === 0) continue
      parts.push(key === 'and' ? { and: children } : { or: children })
      continue
    }

    parts.push(...conditionsOf(key, value))
  }

  if (parts.length === 0) return undefined
  const [only] = parts
  return parts.length === 1 && only !== undefined ? only : { and: parts }
}

function conditionsOf(field: string, raw: unknown): FieldCondition[] {
  if (raw === null || typeof raw !== 'object') return []
  const input = raw as RawFilter
  const conditions: FieldCondition[] = []

  for (const operator of OPERATORS) {
    // `hasOwn` rather than a truthiness check: `{ eq: null }` asks for entries
    // whose field is null, and `{ exists: false }` for those that have none.
    if (!Object.hasOwn(input, operator)) continue
    const value = input[operator]
    if (value === undefined) continue
    conditions.push({ field, operator, value })
  }

  return conditions
}
