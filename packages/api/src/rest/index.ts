/**
 * The REST transport.
 *
 * Everything here is HTTP shape and REST's composition of `src/content/`, which
 * is where the permission, draft, filter, cursor and serialisation decisions
 * live — the ones GraphQL shares rather than reimplements.
 */

export { parseCreateBody, parseRestoreBody, parseUpdateBody } from './body.js'
export type {
  ContentPage,
  ContentService,
  ContentServiceOptions,
  ReadOptions,
} from './content-service.js'
export { createContentService } from './content-service.js'
export { FILTER_PREFIX, parseFilter } from './filter.js'
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
