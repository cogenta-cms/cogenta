export { hashIp } from './ip-hash.js'
export {
  COMMENT_ANONYMOUS,
  COMMENT_PERMISSIONS,
  type CommentActor,
  type CommentPermission,
  type CommentPermissionLayer,
  type CommentPermissionOptions,
  createCommentPermissions,
  DEFAULT_COMMENT_ROLES,
} from './permissions.js'
export {
  COMMENT_RATE_LIMIT_WINDOW_MS,
  type CommentRateLimiter,
  createCommentRateLimiter,
} from './rate-limit.js'
export {
  type CommentsRequest,
  type CommentsResponse,
  type CommentsRouter,
  type CommentsRouterOptions,
  createCommentsRouter,
} from './router.js'
export {
  type CollectionCommentSettings,
  type CommentSettingsStore,
  createCommentSettingsStore,
  type EntryCommentSettings,
  effectiveEnabled,
  effectiveModerationRequired,
} from './settings-store.js'
export { checkSpamHeuristics, type SpamCheckOptions, type SpamCheckResult } from './spam.js'
export {
  type CommentModerationUpdate,
  type CommentStore,
  type CommentStoreOptions,
  createCommentStore,
} from './store.js'
export { dropCommentsTables, ensureCommentsTables, TABLES as COMMENT_TABLES } from './tables.js'
export * from './types.js'
