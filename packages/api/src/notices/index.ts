/**
 * Admin notices — the generic recommendation mechanism ADR-0021 asks for.
 *
 * See `types.ts` for what a notice is and why it is shaped this way.
 */

export type { ApiKeyExpiryOptions } from './api-key-expiry.js'
export { createApiKeyExpiryNoticeSource } from './api-key-expiry.js'
export type { AuditIntegritySourceOptions } from './audit-integrity.js'
export { AUDIT_INTEGRITY_BROKEN_ID, createAuditIntegritySource } from './audit-integrity.js'
export type { NoticeDismissalStore } from './dismissals.js'
export { createNoticeDismissalStore, NOTICE_DISMISSALS_TABLE } from './dismissals.js'
export type { MfaRecommendationOptions } from './mfa-recommendation.js'
export { createMfaRecommendationSource, MFA_RECOMMENDATION_ID } from './mfa-recommendation.js'
export type { NoticeRouter, NoticeRouterOptions } from './router.js'
export { createNoticeRouter } from './router.js'
export type { SuspiciousActivityOptions } from './suspicious-activity.js'
export {
  createSuspiciousActivitySource,
  SUSPICIOUS_ACTIVITY_ID,
} from './suspicious-activity.js'
export type { AdminNotice, NoticeContext, NoticeSeverity, NoticeSource } from './types.js'
