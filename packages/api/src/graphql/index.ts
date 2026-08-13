/**
 * The GraphQL transport.
 *
 * GraphQL is a *transport* here, not a second content engine: it derives its
 * schema from the collections, parses a document, and calls the same gateway —
 * therefore the same permission layer and the same serialisation — that REST
 * calls. The L1 spec asks for exactly that: "REST and GraphQL expose the same
 * thing and share the same permission and serialisation layer. There are not
 * two implementations."
 */

export type { GraphQLContext } from './context.js'
export { createRequestContext } from './context.js'
export type { BatchLoadFn, Loader } from './dataloader.js'
export { createLoader } from './dataloader.js'
export { documentError, queryInvalid, scrubError } from './errors.js'
export type {
  GraphQLRequest,
  GraphQLResponse,
  GraphQLTransportOptions,
} from './execute.js'
export { executeGraphQL } from './execute.js'
export { registerFilterInput, toFilter } from './filters.js'
export type { ContentGateway, ContentGatewayOptions, MutationInput } from './gateway.js'
export { createContentGateway, matches } from './gateway.js'
export { entryFieldName, interfaceNameOf, listFieldName, mutationName } from './naming.js'
export type { ContentSchemaOptions, EntryNode } from './schema.js'
export { buildContentSchema, DEFAULT_MAX_DEPTH, renderSdl } from './schema.js'
