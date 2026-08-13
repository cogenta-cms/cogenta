import { CONTENT_STATUSES, PROVENANCE_KINDS } from '@cogenta/schema'
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLFloat,
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLString,
  valueFromASTUntyped,
} from 'graphql'

/**
 * The types every collection shares.
 *
 * They are built once and reused across collections so that the printed SDL has
 * one `PageInfo`, one `JSON` and one `ContentStatus` — a schema that repeats
 * itself per collection is unreadable at twenty collections.
 */

/**
 * Rich text, block payloads, `json` fields and provenance detail.
 *
 * Modelling rich text as a GraphQL type tree was considered and rejected: it is
 * contract B's business, it changes on a block RFC rather than on an API
 * release, and a theme already receives it typed through `.cogenta/types.d.ts`.
 */
export const JSONScalar = new GraphQLScalarType<unknown, unknown>({
  name: 'JSON',
  description: 'An arbitrary JSON value, serialised as-is.',
  coerceOutputValue: (value) => value,
  coerceInputValue: (value) => value,
  coerceInputLiteral: (node) => valueFromASTUntyped(node),
})

export const PageInfoType = new GraphQLObjectType({
  name: 'PageInfo',
  description: 'Cursor pagination state. There is no offset and no total: both drift.',
  fields: {
    hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) },
    endCursor: {
      type: GraphQLString,
      description: 'Pass to `after` to continue. Null when this is the last page.',
    },
  },
})

export const GeoPointType = new GraphQLObjectType({
  name: 'GeoPoint',
  fields: {
    lat: { type: new GraphQLNonNull(GraphQLFloat) },
    lng: { type: new GraphQLNonNull(GraphQLFloat) },
    label: { type: GraphQLString },
  },
})

export const GeoPointInputType = new GraphQLInputObjectType({
  name: 'GeoPointInput',
  fields: {
    lat: { type: new GraphQLNonNull(GraphQLFloat) },
    lng: { type: new GraphQLNonNull(GraphQLFloat) },
    label: { type: GraphQLString },
  },
})

export const BlockType = new GraphQLObjectType({
  name: 'Block',
  description: 'One block of a zone. Contract B: semantic data, never HTML or CSS.',
  fields: {
    key: {
      type: new GraphQLNonNull(GraphQLString),
      description: 'Stable across edits, which is what anchors a diff or a comment.',
    },
    type: { type: new GraphQLNonNull(GraphQLString) },
    data: { type: new GraphQLNonNull(JSONScalar) },
  },
})

export const BlockInputType = new GraphQLInputObjectType({
  name: 'BlockInput',
  fields: {
    key: {
      type: GraphQLString,
      description: 'Omit on a new block: the engine mints one and never recomputes it.',
    },
    type: { type: new GraphQLNonNull(GraphQLString) },
    data: { type: new GraphQLNonNull(JSONScalar) },
  },
})

export const ContentStatusEnum = new GraphQLEnumType({
  name: 'ContentStatus',
  values: Object.fromEntries(
    CONTENT_STATUSES.map((status) => [status.toUpperCase(), { value: status }]),
  ),
})

export const ProvenanceEnum = new GraphQLEnumType({
  name: 'Provenance',
  description: 'Who wrote this. Required by the European AI framework, so never optional.',
  values: Object.fromEntries(PROVENANCE_KINDS.map((kind) => [kind.toUpperCase(), { value: kind }])),
})

export const SortDirectionEnum = new GraphQLEnumType({
  name: 'SortDirection',
  values: { ASC: { value: 'asc' }, DESC: { value: 'desc' } },
})

/**
 * Ordering is limited to columns that are never null.
 *
 * A cursor is a position in an ordering; on a nullable column the ordering is
 * partial and the cursor can skip a row. This is the same restriction the store
 * enforces, surfaced in the schema so it fails at validation instead of at
 * execution.
 */
export const SortFieldEnum = new GraphQLEnumType({
  name: 'EntrySortField',
  values: {
    ID: { value: 'id' },
    CREATED_AT: { value: 'createdAt' },
    UPDATED_AT: { value: 'updatedAt' },
  },
})

export const SortInputType = new GraphQLInputObjectType({
  name: 'EntrySort',
  fields: {
    field: { type: new GraphQLNonNull(SortFieldEnum) },
    direction: { type: new GraphQLNonNull(SortDirectionEnum) },
  },
})
