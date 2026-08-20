import type { ChannelSeverity, NotificationDispatcher } from '@cogenta/channels'
import type { NoticeHistoryEntry } from './history.js'

/**
 * "Les canaux de `@cogenta/channels` sont réellement utilisables depuis un
 * site" — fiche 38 task 3. Everything a message needs to travel through a
 * channel already exists and is fully tested (L6): the dispatcher filters by
 * preference and severity, defers into quiet hours, groups into a digest.
 * This module is the one new thing — the seam that turns "a notice just
 * appeared" into a call to that dispatcher — and it stays that small on
 * purpose: composing the message by hand here, instead of handing the
 * dispatcher a title and a summary, would be rebuilding what `formats/` and
 * `preferences/dispatcher.ts` already own.
 *
 * Deliberately fired only for entries `NoticeHistoryStore.sync` reports as
 * *changed* (new, or resolved-then-reappeared) — never for the full list on
 * every poll. A notice still on screen a minute after it first appeared must
 * not send a second Telegram message for the same thing; that is what
 * "History" existing at all buys this bridge for free.
 */
export interface NoticeChannelBridgeOptions {
  readonly dispatcher: NotificationDispatcher
  /** The channel(s) this person has linked. Usually `ChannelLinkStore.listLinkedChannels` mapped to names. */
  readonly linkedChannelNames: (userId: string) => Promise<readonly string[]>
  /** Renders the notice's translated title/body for the message — the admin does the same lookup for the on-screen board (ADR-0019). Server-side channel wording therefore stays in English/whatever locale this returns; a caller with real i18n on the server passes a real translator. */
  readonly render: (entry: NoticeHistoryEntry) => {
    readonly title: string
    readonly summary: string
  }
}

export interface NoticeChannelBridge {
  /** Never throws: a channel failing to send must not break the notices response it rode in on. */
  notifyNew(userId: string, changed: readonly NoticeHistoryEntry[]): Promise<void>
}

/**
 * `AdminNotice.severity` is four-valued (`info`/`success`/`warning`/`danger`,
 * `types.ts`); `ChannelSeverity` (`@cogenta/channels`) is three-valued. The
 * mapping folds `success` into `info` (neither is actionable) and `danger`
 * into `critical` (the one severity quiet hours never defer, `preferences/
 * dispatcher.ts`) — a notice fiche 38 task 5 renders as "critical" must also
 * be the one that reaches a phone at 3am.
 */
export function toChannelSeverity(severity: NoticeHistoryEntry['severity']): ChannelSeverity {
  if (severity === 'danger') return 'critical'
  if (severity === 'warning') return 'warning'
  return 'info'
}

export function createNoticeChannelBridge(
  options: NoticeChannelBridgeOptions,
): NoticeChannelBridge {
  return {
    async notifyNew(userId, changed) {
      if (changed.length === 0) return
      const channelNames = await options.linkedChannelNames(userId).catch(() => [])
      if (channelNames.length === 0) return

      for (const entry of changed) {
        const { title, summary } = options.render(entry)
        for (const channelName of channelNames) {
          await options.dispatcher
            .notify({
              userId,
              channelName,
              eventType: 'admin-notice',
              severity: toChannelSeverity(entry.severity),
              title,
              summary,
            })
            .catch(() => undefined)
        }
      }
    },
  }
}
