import type { ChannelSeverity } from '../adapter.js'

/**
 * An open, but real, typed set of event kinds a producer (an approval
 * dispatch, a future SEO/security/performance agent report) can notify
 * about — "quels types d'événements" (lot doc) needs something a user can
 * actually opt into, not a bare unvalidated string.
 */
export const CHANNEL_EVENT_TYPES = [
  'approval-request',
  'security-alert',
  'seo-report',
  'performance-report',
  'content-report',
] as const

export type ChannelEventType = (typeof CHANNEL_EVENT_TYPES)[number]

export type GroupingMode = 'immediate' | 'hourly' | 'daily'

/** Minutes since local midnight, `0..1439`. */
export interface QuietHours {
  readonly startMinute: number
  readonly endMinute: number
}

/**
 * "Par utilisateur et par canal : quels types d'événements, quelle gravité
 * minimale, quelle plage horaire, quel regroupement." One row per
 * `(userId, channelName)` — the same user can want immediate critical
 * alerts on one channel and a daily digest on another.
 */
export interface ChannelPreferences {
  readonly eventTypes: readonly ChannelEventType[]
  readonly minSeverity: ChannelSeverity
  /** `null` — no quiet hours configured, nothing is ever deferred by time of day. */
  readonly quietHours: QuietHours | null
  readonly grouping: GroupingMode
}

/**
 * The safe default for a `(userId, channelName)` with no stored row —
 * "receive everything immediately" until the user tunes it down, matching
 * this codebase's R2-style rule that an unconfigured state must still work,
 * never silently drop something the user never asked to suppress.
 */
export const DEFAULT_CHANNEL_PREFERENCES: ChannelPreferences = {
  eventTypes: CHANNEL_EVENT_TYPES,
  minSeverity: 'info',
  quietHours: null,
  grouping: 'immediate',
}

export const SEVERITY_RANK: Readonly<Record<ChannelSeverity, number>> = {
  info: 0,
  warning: 1,
  critical: 2,
}
