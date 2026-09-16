/**
 * The access layer: one permission check for both transports, and the preview
 * tokens that are the only exception to it.
 */

export type { PermissionLayerOptions } from './permissions.js'
export {
  assertAuthenticated,
  createPermissionLayer,
  DEFAULT_ROLES,
  hasRoleDraftAccess,
  PUBLIC_ROLE,
  previewCovers,
} from './permissions.js'
export type {
  IssuedPreviewToken,
  PreviewTokenOptions,
  PreviewTokenRequest,
  PreviewTokenService,
} from './preview-token.js'
export {
  createPreviewTokens,
  MAX_PREVIEW_LIFETIME_SECONDS,
  PREVIEW_SIGNING_KEY_ENV,
  PREVIEW_SIGNING_KEY_MINIMUM_LENGTH,
} from './preview-token.js'
export type { UnlockTokenOptions, UnlockTokenService } from './unlock-token.js'
export {
  createUnlockTokens,
  DEFAULT_UNLOCK_LIFETIME_SECONDS,
  MAX_UNLOCK_LIFETIME_SECONDS,
} from './unlock-token.js'
