import { CogentaError } from '@cogenta/core'
import type {
  BlockZones,
  CollectionDefinition,
  ContentEntry,
  ContentStatus,
  FieldDefinition,
  Provenance,
} from '@cogenta/schema'
import {
  GraphQLBoolean,
  type GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLID,
  GraphQLInputObjectType,
  type GraphQLInputType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  type GraphQLNullableOutputType,
  GraphQLObjectType,
  type GraphQLOutputType,
  GraphQLSchema,
  GraphQLString,
  printSchema,
} from 'graphql'
import type { Filter, QueryRequest } from '../types.js'
import type { GraphQLContext } from './context.js'
import { queryInvalid } from './errors.js'
import { registerFilterInput, toFilter } from './filters.js'
import type { MutationInput } from './gateway.js'
import { entryFieldName, interfaceNameOf, listFieldName, mutationName } from './naming.js'
import {
  BlockInputType,
  BlockType,
  ContentStatusEnum,
  GeoPointInputType,
  GeoPointType,
  JSONScalar,
  PageInfoType,
  ProvenanceEnum,
  SortInputType,
} from './scalars.js'

/** The store's block shape, reached through `BlockZones`. */
type StoreBlock = BlockZones[string][number]

/**
 * The GraphQL schema, derived from the collections.
 *
 * Nothing here is hand-written per collection: a type, a connection, a filter,
 * a pair of mutation inputs and five mutations are generated from the field
 * definitions, exactly as `.cogenta/types.d.ts` and `.cogenta/schema.json` are.
 * The schema is the single source of truth (L1), so adding a field to a
 * collection adds it to the SDL, to the filter and to the mutation inputs at
 * once, and nothing is written twice.
 */

/**
 * How many relation hops one query may take, by default.
 *
 * Low on purpose. Relations can be circular — an article's author's articles'
 * author… — and the L1 spec asks for a maximum depth with a low default rather
 * than for a timeout on a query that has already started hammering the
 * database. Two is enough for "the article and its author", which is the
 * overwhelming majority of real queries.
 */
export const DEFAULT_MAX_DEPTH = 2

export interface ContentSchemaOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly maxDepth?: number
}

/**
 * What a resolver passes to its children.
 *
 * Carrying the depth on the value rather than in the context is what makes the
 * bound per root field: two root fields of the same document may legitimately
 * ask for different depths, and a shared counter would have them interfere.
 */
export interface EntryNode {
  readonly collection: string
  readonly entry: ContentEntry
  readonly depth: number
  readonly maxDepth: number
}

interface ListArguments {
  readonly filter?: unknown
  readonly sort?: readonly { readonly field: string; readonly direction: 'asc' | 'desc' }[]
  readonly after?: string
  readonly limit?: number
  readonly locale?: string
  readonly depth?: number
}

type Values = Readonly<Record<string, unknown>>

export function buildContentSchema(options: ContentSchemaOptions): GraphQLSchema {
  const collections = [...options.collections].sort((left, right) =>
    left.name < right.name ? -1 : 1,
  )
  const configuredDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  if (!Number.isInteger(configuredDepth) || configuredDepth < 0) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: 'The maximum GraphQL expansion depth must be a whole number of hops.',
      hint: 'Use 0 to forbid relation expansion entirely, 2 for the usual "entry and its relations".',
    })
  }

  const byName = new Map(collections.map((collection) => [collection.name, collection]))
  const objectTypes = new Map<string, GraphQLObjectType<EntryNode, GraphQLContext>>()

  // Registered before any thunk runs, so a relation can name a collection
  // declared after it — or itself.
  for (const collection of collections) {
    objectTypes.set(collection.name, entryType(collection))
  }

  function typeOf(name: string): GraphQLObjectType<EntryNode, GraphQLContext> {
    const found = objectTypes.get(name)
    if (found === undefined) {
      throw new CogentaError({
        code: 'SCHEMA_INVALID',
        message: `A relation points at "${name}", which is not one of the collections.`,
        hint: 'Declare the target collection, or fix the `to` option of the relation.',
      })
    }
    return found
  }

  function entryType(
    collection: CollectionDefinition,
  ): GraphQLObjectType<EntryNode, GraphQLContext> {
    return new GraphQLObjectType<EntryNode, GraphQLContext>({
      name: interfaceNameOf(collection),
      description: collection.labels.plural,
      fields: () => {
        const fields: GraphQLFieldConfigMap<EntryNode, GraphQLContext> = {
          id: { type: new GraphQLNonNull(GraphQLID), resolve: (node) => node.entry.id },
          createdAt: {
            type: new GraphQLNonNull(GraphQLString),
            resolve: (node) => node.entry.createdAt,
          },
          updatedAt: {
            type: new GraphQLNonNull(GraphQLString),
            resolve: (node) => node.entry.updatedAt,
          },
          createdBy: { type: GraphQLID, resolve: (node) => node.entry.createdBy },
          updatedBy: { type: GraphQLID, resolve: (node) => node.entry.updatedBy },
          status: {
            type: new GraphQLNonNull(ContentStatusEnum),
            resolve: (node) => node.entry.status,
          },
          locale: { type: new GraphQLNonNull(GraphQLString), resolve: (node) => node.entry.locale },
          translationOf: { type: GraphQLID, resolve: (node) => node.entry.translationOf },
          version: { type: new GraphQLNonNull(GraphQLInt), resolve: (node) => node.entry.version },
          provenance: {
            type: new GraphQLNonNull(ProvenanceEnum),
            description: 'Human, assisted or generated. Never absent (contract A).',
            resolve: (node) => node.entry.provenance,
          },
          provenanceDetail: { type: JSONScalar, resolve: (node) => node.entry.provenanceDetail },
          publishedAt: { type: GraphQLString, resolve: (node) => node.entry.publishedAt },
        }

        for (const [name, field] of Object.entries(collection.fields)) {
          fields[name] = fieldConfig(name, field)
        }
        return fields
      },
    })
  }

  function fieldConfig(
    name: string,
    field: FieldDefinition,
  ): GraphQLFieldConfigMap<EntryNode, GraphQLContext>[string] {
    if (field.kind === 'blocks') {
      return {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(BlockType))),
        resolve: (node) => node.entry.blocks[name] ?? [],
      }
    }

    const target = field.kind === 'relation' ? String(field.options['to'] ?? '') : ''
    if (field.kind === 'relation' && byName.has(target)) {
      return relationField(name, field, target)
    }

    return {
      type: nonNullable(field, outputTypeOf(field)),
      resolve: (node) => node.entry.values[name] ?? null,
    }
  }

  function relationField(
    name: string,
    field: FieldDefinition,
    target: string,
  ): GraphQLFieldConfigMap<EntryNode, GraphQLContext>[string] {
    const many = field.options['many'] === true
    const type = typeOf(target)

    return {
      type: many
        ? new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type)))
        : field.required === true
          ? new GraphQLNonNull(type)
          : type,
      description: `Related ${target}. Counts against the expansion depth.`,
      resolve: async (node, _args, context): Promise<EntryNode | readonly EntryNode[] | null> => {
        const depth = node.depth + 1
        if (depth > node.maxDepth) {
          throw queryInvalid(
            `Expanding "${name}" would exceed the maximum relation depth of ${node.maxDepth}.`,
            'Relations can be circular. Ask for fewer hops, or raise `depth` if the server allows it.',
          )
        }

        // Every related entry goes through the loader, so a page of twenty
        // parents produces one batched read rather than twenty — and the
        // gateway still applies the read permission and the preview scope to
        // each id inside that batch.
        const loader = context.loaderFor(target)
        const raw = node.entry.values[name]

        if (many) {
          const ids = Array.isArray(raw) ? raw.filter(isNonEmptyString) : []
          const found = await loader.loadMany(ids)
          // A target the reader may not see is simply absent, which is the
          // draft rule showing through the relation rather than an error.
          return found
            .filter((entry): entry is ContentEntry => entry !== null)
            .map((entry) => ({ collection: target, entry, depth, maxDepth: node.maxDepth }))
        }

        if (!isNonEmptyString(raw)) return null
        const entry = await loader.load(raw)
        return entry === null ? null : { collection: target, entry, depth, maxDepth: node.maxDepth }
      },
    }
  }

  // -------------------------------------------------------------- connection

  function connectionType(
    collection: CollectionDefinition,
  ): GraphQLObjectType<
    { readonly edges: readonly { readonly node: EntryNode; readonly cursor: string }[] },
    GraphQLContext
  > {
    const type = typeOf(collection.name)
    const name = interfaceNameOf(collection)

    const edge = new GraphQLObjectType<{ node: EntryNode; cursor: string }, GraphQLContext>({
      name: `${name}Edge`,
      fields: {
        node: { type: new GraphQLNonNull(type) },
        cursor: {
          type: new GraphQLNonNull(GraphQLString),
          description: 'Opaque position in the ordering. Never an offset.',
        },
      },
    })

    return new GraphQLObjectType({
      name: `${name}Connection`,
      fields: {
        edges: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(edge))) },
        pageInfo: { type: new GraphQLNonNull(PageInfoType) },
      },
    })
  }

  // ------------------------------------------------------------ input shapes

  function writableInput(collection: CollectionDefinition, mode: 'Create' | 'Update') {
    const fields: Record<string, { type: GraphQLInputType; description?: string }> = {}

    if (mode === 'Create') {
      fields['locale'] = { type: GraphQLString }
      fields['translationOf'] = {
        type: GraphQLID,
        description: 'The source entry this translates (ADR-0014: one entry per language).',
      }
      fields['status'] = {
        type: ContentStatusEnum,
        description: 'Creating something already PUBLISHED requires the publish permission.',
      }
    }
    fields['provenance'] = { type: ProvenanceEnum }

    for (const [name, field] of Object.entries(collection.fields)) {
      fields[name] = { type: inputTypeOf(field) }
    }

    return new GraphQLInputObjectType({
      name: `${interfaceNameOf(collection)}${mode}Input`,
      description:
        // Every field is optional, including the required ones: a draft is
        // allowed to be half-written, and `required` starts to mean something
        // at publication, where the store enforces it.
        'Every field is optional: `required` is checked at publication, not while drafting.',
      fields,
    })
  }

  // ------------------------------------------------------------------ fields

  const queryFields: GraphQLFieldConfigMap<unknown, GraphQLContext> = {}
  const mutationFields: GraphQLFieldConfigMap<unknown, GraphQLContext> = {}

  for (const collection of collections) {
    const type = typeOf(collection.name)
    const connection = connectionType(collection)
    const filterInput = registerFilterInput(collection)
    const createInput = writableInput(collection, 'Create')
    const updateInput = writableInput(collection, 'Update')
    const name = collection.name

    queryFields[entryFieldName(collection)] = {
      type,
      description: `One ${collection.labels.singular} by identifier.`,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        depth: { type: GraphQLInt, description: 'Relation hops to expand. Capped by the server.' },
      },
      resolve: async (_root, args: { id: string; depth?: number }, context) => {
        const entry = await context.gateway.read(name, args.id, context.access)
        return entry === null
          ? null
          : { collection: name, entry, depth: 0, maxDepth: depthOf(args.depth) }
      },
    }

    queryFields[listFieldName(collection)] = {
      type: new GraphQLNonNull(connection),
      description: `${collection.labels.plural}, paginated by cursor.`,
      args: {
        filter: { type: filterInput },
        sort: { type: new GraphQLList(new GraphQLNonNull(SortInputType)) },
        after: { type: GraphQLString, description: 'The `endCursor` of the previous page.' },
        limit: { type: GraphQLInt },
        locale: { type: GraphQLString },
        depth: { type: GraphQLInt },
      },
      resolve: async (_root, args: ListArguments, context) => {
        const maxDepth = depthOf(args.depth)
        const request = toQueryRequest(name, args)
        const page = await context.gateway.list(request, context.access)

        return {
          edges: page.items.map((entry, index) => ({
            node: { collection: name, entry, depth: 0, maxDepth },
            // The cursor of the last edge is the page's `endCursor`; the others
            // are given for symmetry, and are the position of that very entry.
            cursor:
              index === page.items.length - 1 && page.nextCursor !== null
                ? page.nextCursor
                : entry.id,
          })),
          pageInfo: { hasNextPage: page.hasMore, endCursor: page.nextCursor },
        }
      },
    }

    mutationFields[mutationName('create', collection)] = {
      type: new GraphQLNonNull(type),
      args: { input: { type: new GraphQLNonNull(createInput) } },
      resolve: async (_root, args: { input: Values }, context) => {
        const entry = await context.gateway.create(
          name,
          toMutationInput(collection, args.input),
          context.access,
        )
        return { collection: name, entry, depth: 0, maxDepth: configuredDepth }
      },
    }

    mutationFields[mutationName('update', collection)] = {
      type: new GraphQLNonNull(type),
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        input: { type: new GraphQLNonNull(updateInput) },
      },
      resolve: async (_root, args: { id: string; input: Values }, context) => {
        const entry = await context.gateway.update(
          name,
          args.id,
          toMutationInput(collection, args.input),
          context.access,
        )
        return { collection: name, entry, depth: 0, maxDepth: configuredDepth }
      },
    }

    mutationFields[mutationName('delete', collection)] = {
      type: new GraphQLNonNull(GraphQLBoolean),
      description: 'True when an entry was removed, false when there was nothing to remove.',
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      resolve: (_root, args: { id: string }, context) =>
        context.gateway.remove(name, args.id, context.access),
    }

    mutationFields[mutationName('publish', collection)] = {
      type: new GraphQLNonNull(type),
      description: 'Makes the working copy the one the public renderer reads.',
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      resolve: async (_root, args: { id: string }, context) => {
        const entry = await context.gateway.publish(name, args.id, context.access)
        return { collection: name, entry, depth: 0, maxDepth: configuredDepth }
      },
    }

    mutationFields[mutationName('restore', collection)] = {
      type: new GraphQLNonNull(type),
      description: 'Restores a kept version as a new version; the history stays append-only.',
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        version: { type: new GraphQLNonNull(GraphQLInt) },
      },
      resolve: async (_root, args: { id: string; version: number }, context) => {
        const entry = await context.gateway.restore(name, args.id, args.version, context.access)
        return { collection: name, entry, depth: 0, maxDepth: configuredDepth }
      },
    }
  }

  function depthOf(requested: number | undefined): number {
    if (requested === undefined) return configuredDepth
    if (!Number.isInteger(requested) || requested < 0) {
      throw queryInvalid(
        'A depth is a whole number of relation hops, zero or more.',
        'Omit `depth` to use the server default.',
      )
    }
    // The argument may only ever lower the bound: a circular schema plus a
    // client-chosen depth is a denial of service with a polite syntax.
    return Math.min(requested, configuredDepth)
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({ name: 'Query', fields: queryFields }),
    mutation: new GraphQLObjectType({ name: 'Mutation', fields: mutationFields }),
  })
}

/** The SDL, printed from the very schema that will answer the queries. */
export function renderSdl(options: ContentSchemaOptions): string {
  return printSchema(buildContentSchema(options))
}

// ------------------------------------------------------------------ mapping

function outputTypeOf(field: FieldDefinition): GraphQLNullableOutputType {
  const many = field.options['many'] === true

  switch (field.kind) {
    case 'number':
      return field.options['integer'] === true ? GraphQLInt : GraphQLFloat
    case 'boolean':
      return GraphQLBoolean
    case 'richText':
    case 'json':
      return JSONScalar
    case 'geo':
      return GeoPointType
    case 'media':
    case 'relation':
      return many ? new GraphQLList(new GraphQLNonNull(GraphQLID)) : GraphQLID
    case 'select':
      return many ? new GraphQLList(new GraphQLNonNull(GraphQLString)) : GraphQLString
    default:
      // text, slug, color, date, datetime — all rendered as strings, because a
      // date is an ISO string everywhere else in Cogenta too.
      return GraphQLString
  }
}

function inputTypeOf(field: FieldDefinition): GraphQLInputType {
  const many = field.options['many'] === true

  switch (field.kind) {
    case 'number':
      return field.options['integer'] === true ? GraphQLInt : GraphQLFloat
    case 'boolean':
      return GraphQLBoolean
    case 'richText':
    case 'json':
      return JSONScalar
    case 'geo':
      return GeoPointInputType
    case 'blocks':
      return new GraphQLList(new GraphQLNonNull(BlockInputType))
    case 'media':
    case 'relation':
      return many ? new GraphQLList(new GraphQLNonNull(GraphQLID)) : GraphQLID
    case 'select':
      return many ? new GraphQLList(new GraphQLNonNull(GraphQLString)) : GraphQLString
    default:
      return GraphQLString
  }
}

/**
 * Mirrors the nullability of the generated TypeScript types.
 *
 * A field holding several values is never null — its empty case is `[]` — and a
 * `required` field is non-null. Anything else is nullable, so a theme or a
 * client that forgets the empty case hears about it.
 */
function nonNullable(field: FieldDefinition, type: GraphQLNullableOutputType): GraphQLOutputType {
  const many = field.options['many'] === true
  if (many) return new GraphQLNonNull(type)
  return field.required === true ? new GraphQLNonNull(type) : type
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function toQueryRequest(collection: string, args: ListArguments): QueryRequest {
  const filter: Filter | undefined = toFilter(args.filter)

  return {
    collection,
    ...(filter === undefined ? {} : { filter }),
    ...(args.sort === undefined ? {} : { sort: args.sort }),
    ...(args.after === undefined ? {} : { after: args.after }),
    ...(args.limit === undefined ? {} : { limit: args.limit }),
    ...(args.locale === undefined ? {} : { locale: args.locale }),
  }
}

/** Splits the flat mutation input into values, block zones and system fields. */
function toMutationInput(collection: CollectionDefinition, input: Values): MutationInput {
  const values: Record<string, unknown> = {}
  const blocks: Record<string, readonly StoreBlock[]> = {}

  for (const [name, field] of Object.entries(collection.fields)) {
    if (!Object.hasOwn(input, name)) continue
    const value = input[name]

    if (field.kind === 'blocks') {
      blocks[name] = toBlocks(value)
      continue
    }
    values[name] = value
  }

  const status = input['status']
  const locale = input['locale']
  const translationOf = input['translationOf']
  const provenance = input['provenance']

  return {
    values,
    ...(Object.keys(blocks).length === 0 ? {} : { blocks: blocks as BlockZones }),
    ...(typeof locale === 'string' ? { locale } : {}),
    ...(typeof status === 'string' ? { status: status as ContentStatus } : {}),
    ...(translationOf === undefined ? {} : { translationOf: asNullableId(translationOf) }),
    ...(typeof provenance === 'string' ? { provenance: provenance as Provenance } : {}),
  }
}

function toBlocks(value: unknown): readonly StoreBlock[] {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const block = (raw ?? {}) as Readonly<Record<string, unknown>>
    const data = block['data']
    return {
      // An empty key asks the store to mint one; it is never recomputed from
      // the position, which is what lets a diff follow a block across edits.
      key: typeof block['key'] === 'string' ? block['key'] : '',
      type: typeof block['type'] === 'string' ? block['type'] : '',
      data: (data ?? {}) as Readonly<Record<string, unknown>>,
    }
  })
}

function asNullableId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}
