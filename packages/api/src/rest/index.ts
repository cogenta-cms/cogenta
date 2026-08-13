/**
 * The REST transport, and the service both transports share.
 *
 * `content-service.ts` is the half GraphQL must reuse rather than reimplement;
 * everything else here is HTTP shape.
 */

export { parseCreateBody, parseRestoreBody, parseUpdateBody } from './body.js'
export type {
  ContentPage,
  ContentService,
  ContentServiceOptions,
  ReadOptions,
} from './content-service.js'
export { createContentService } from './content-service.js'
export { FILTER_PREFIX, matchesFilter, parseFilter } from './filter.js'
export type { RestErrorBody, RestRequest, RestResponse } from './http.js'
export { errorResponse, jsonResponse, queryError, statusFor } from './http.js'
export type { ListQuery, QueryLimits, ReadQuery } from './query.js'
export {
  DEFAULT_LIMITS,
  parseListQuery,
  parsePositiveInteger,
  parseReadQuery,
} from './query.js'
export type { RestRouter, RestRouterOptions } from './router.js'
export { createRestRouter } from './router.js'
export type { ExpansionOptions, ExpansionSource, SerialisedEntry } from './serialise.js'
export { serialiseEntry } from './serialise.js'
