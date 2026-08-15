/**
 * The REST transport.
 *
 * Everything here is HTTP shape and REST's composition of `src/content/`, which
 * is where the permission, draft, filter, cursor and serialisation decisions
 * live — the ones GraphQL shares rather than reimplements.
 */

export type {
  AgentRegistryLike,
  AgentSummary,
  AgentsRouter,
  AgentsRouterOptions,
  AgentUsage,
  AuditLogLike,
  TraceStoreLike,
} from './agents-router.js'
export { createAgentsRouter } from './agents-router.js'
export type { AuditRouter, AuditRouterOptions } from './audit-router.js'
export { createAuditRouter } from './audit-router.js'
export type { AuthRouter, AuthRouterOptions } from './auth-router.js'
export { createAuthRouter, resolveActor } from './auth-router.js'
export { parseCreateBody, parseRestoreBody, parseUpdateBody } from './body.js'
export type {
  ContentPage,
  ContentService,
  ContentServiceOptions,
  ReadOptions,
} from './content-service.js'
export { createContentService } from './content-service.js'
export type { DependencySource, ResponseDependencies } from './dependencies.js'
export { collectDependencies } from './dependencies.js'
export { FILTER_PREFIX, parseFilter } from './filter.js'
export type { RestErrorBody, RestRequest, RestResponse } from './http.js'
export { errorResponse, jsonResponse, queryError, statusFor } from './http.js'
export type { MediaRouter, MediaRouterOptions } from './media-router.js'
export { createMediaRouter } from './media-router.js'
export type { PathResolution, RoutingOptions } from './path-resolution.js'
export { lookupFilter, NO_REDIRECTS } from './path-resolution.js'
export type { ListQuery, QueryLimits, ReadQuery } from './query.js'
export {
  DEFAULT_LIMITS,
  parseListQuery,
  parsePositiveInteger,
  parseReadQuery,
} from './query.js'
export type { RestRouter, RestRouterOptions } from './router.js'
export { createRestRouter } from './router.js'
export type { UsersRouter, UsersRouterOptions } from './users-router.js'
export { createUsersRouter } from './users-router.js'
