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
} from './preview-token.js'
