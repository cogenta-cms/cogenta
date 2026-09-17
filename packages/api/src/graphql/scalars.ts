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
 * GraphQL orders by the three system columns only.
 *
 * The store learned to order by a date a collection declares (`schema@2.4`,
 * ADR-0038) and REST exposes it — GraphQL does not, and that is a stated
 * limit rather than an oversight: a typed schema would need this enum built
 * per collection (the declared dates of `event` are not those of `article`),
 * which changes how the schema is generated. Until that is worth doing, a
 * GraphQL client that needs "the next events" asks REST, which validates the
 * field against the collection it is really listing.
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
