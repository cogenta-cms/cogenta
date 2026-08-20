/**
 * Admin notices — the generic recommendation mechanism ADR-0021 asks for.
 *
 * See `types.ts` for what a notice is and why it is shaped this way.
 */

export type { ApiKeyExpiryOptions } from './api-key-expiry.js'
export { createApiKeyExpiryNoticeSource } from './api-key-expiry.js'
export type { AuditIntegritySourceOptions } from './audit-integrity.js'
export { AUDIT_INTEGRITY_BROKEN_ID, createAuditIntegritySource } from './audit-integrity.js'
export type { NoticeChannelBridge, NoticeChannelBridgeOptions } from './channel-bridge.js'
export { createNoticeChannelBridge, toChannelSeverity } from './channel-bridge.js'
export type {
  NoticeChannelSettingsRouter,
  NoticeChannelSettingsRouterOptions,
} from './channel-settings-router.js'
export { createNoticeChannelSettingsRouter } from './channel-settings-router.js'
export type { NoticeDismissalStore } from './dismissals.js'
export { createNoticeDismissalStore, NOTICE_DISMISSALS_TABLE } from './dismissals.js'
export type {
  NoticeHistoryEntry,
  NoticeHistoryFilter,
  NoticeHistoryStore,
} from './history.js'
export { createNoticeHistoryStore, NOTICE_HISTORY_TABLE } from './history.js'
export type { MfaRecommendationOptions } from './mfa-recommendation.js'
export { createMfaRecommendationSource, MFA_RECOMMENDATION_ID } from './mfa-recommendation.js'
export type { PendingMigrationsOptions } from './pending-migrations.js'
export {
  createPendingMigrationsSource,
  PENDING_MIGRATIONS_NOTICE_ID,
} from './pending-migrations.js'
export type { DisabledPluginRecord, PluginDisabledOptions } from './plugin-disabled.js'
export { createPluginDisabledSource, pluginDisabledNoticeId } from './plugin-disabled.js'
export type { RecoveryCodeUsedOptions } from './recovery-code-used.js'
export {
  createRecoveryCodeUsedNoticeSource,
  RECOVERY_CODE_USED_ID,
} from './recovery-code-used.js'
export type { NoticeRouter, NoticeRouterOptions } from './router.js'
export { createNoticeRouter } from './router.js'
export type {
  ScheduledPublishFailedOptions,
  ScheduledPublishFailureRecord,
} from './scheduled-publish-failed.js'
export { createScheduledPublishFailedSource } from './scheduled-publish-failed.js'
export type { SuspiciousActivityOptions } from './suspicious-activity.js'
export {
  createSuspiciousActivitySource,
  SUSPICIOUS_ACTIVITY_ID,
} from './suspicious-activity.js'
export type { AdminNotice, NoticeContext, NoticeSeverity, NoticeSource } from './types.js'
