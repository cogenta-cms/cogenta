import { type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import type { ChannelMessage, ChannelSeverity, MessageId } from '../adapter.js'
import { buildNotification } from '../formats/notification.js'
import { buildReport } from '../formats/report.js'
import type { ChannelLinkStore } from '../linking/store.js'
import type { ChannelRegistry } from '../registry.js'
import { isWithinQuietHours } from './quiet-hours.js'
import type { PreferenceStore } from './store.js'
import { PREFERENCE_TABLES } from './tables.js'
import { type ChannelEventType, SEVERITY_RANK } from './types.js'

export interface NotifyInput {
  readonly userId: string
  readonly channelName: string
  readonly eventType: ChannelEventType
  readonly severity: ChannelSeverity
  readonly title: string
  readonly summary: string
}

export type NotifyOutcome =
  | { readonly dispatched: true; readonly messageId: MessageId }
  | {
      readonly dispatched: false
      readonly reason:
        | 'not-subscribed'
        | 'below-severity-threshold'
        | 'no-linked-channel'
        | 'deferred-quiet-hours'
        | 'queued-for-grouping'
    }

export interface NotificationDispatcher {
  /** Filters against preferences, then either sends immediately or queues for a later `flushDue()`. Never throws on a normal filtered/queued outcome — only on a real infra failure. */
  notify(input: NotifyInput): Promise<NotifyOutcome>
  /** "sans lui, un scan de dépendances produit quinze messages" — collapses every due group of pending notifications into one message each. Call periodically; scheduling it is the deployer's job (same honest split as `resetPlaygroundData`, L9 task 12). */
  flushDue(): Promise<readonly MessageId[]>
}

const GROUPING_WINDOW_MS: Readonly<Record<'hourly' | 'daily', number>> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
}

interface PendingRow {
  id: string
  user_id: string
  channel_name: string
  title: string
  summary: string
  created_at: string
}

export interface CreateNotificationDispatcherOptions {
  readonly db: DatabaseHandle
  readonly registry: ChannelRegistry
  readonly linkStore: ChannelLinkStore
  readonly preferenceStore: PreferenceStore
  readonly buildAdminUrl: (userId: string, channelName: string) => string
  readonly now?: () => number
}

export function createNotificationDispatcher(
  options: CreateNotificationDispatcherOptions,
): NotificationDispatcher {
  const { db, registry, linkStore, preferenceStore, buildAdminUrl } = options
  const now = options.now ?? Date.now
  const pending = identifier(PREFERENCE_TABLES.pending, db.dialect)

  async function resolveTarget(userId: string, channelName: string) {
    const linked = await linkStore.listLinkedChannels(userId)
    return linked.find((l) => l.channelName === channelName) ?? null
  }

  async function enqueue(input: NotifyInput): Promise<void> {
    await db.query(sql`
      insert into ${pending} (id, user_id, channel_name, event_type, severity, title, summary, created_at)
      values (${newId(now)}, ${input.userId}, ${input.channelName}, ${input.eventType}, ${input.severity}, ${input.title}, ${input.summary}, ${new Date(now()).toISOString()})`)
  }

  async function sendOne(
    channelName: string,
    targetId: string,
    message: ChannelMessage,
  ): Promise<MessageId> {
    return registry.get(channelName).send({ id: targetId }, message)
  }

  return {
    async notify(input) {
      const prefs = await preferenceStore.get(input.userId, input.channelName)

      if (!prefs.eventTypes.includes(input.eventType)) {
        return { dispatched: false, reason: 'not-subscribed' }
      }
      if (SEVERITY_RANK[input.severity] < SEVERITY_RANK[prefs.minSeverity]) {
        return { dispatched: false, reason: 'below-severity-threshold' }
      }

      const inQuietHours =
        prefs.quietHours !== null &&
        input.severity !== 'critical' &&
        isWithinQuietHours(prefs.quietHours, now())

      if (inQuietHours) {
        await enqueue(input)
        return { dispatched: false, reason: 'deferred-quiet-hours' }
      }
      if (prefs.grouping !== 'immediate') {
        await enqueue(input)
        return { dispatched: false, reason: 'queued-for-grouping' }
      }

      const target = await resolveTarget(input.userId, input.channelName)
      if (target === null) return { dispatched: false, reason: 'no-linked-channel' }

      // `NotifyInput` only carries a title/summary, not the separate
      // context/expectedAction/adminUrl an `AlertChannelMessage` requires —
      // a single immediate item always renders as a one-line Notification;
      // producers that need the richer Alert shape (e.g. approvals) build
      // and dispatch it themselves via `buildAlert`/`dispatchApproval`.
      const message = buildNotification(`${input.title} — ${input.summary}`)
      const messageId = await sendOne(input.channelName, target.channelUserId, message)
      return { dispatched: true, messageId }
    },

    async flushDue() {
      const groupsResult = await db.query<{ user_id: string; channel_name: string }>(sql`
        select distinct user_id, channel_name from ${pending}`)

      const sent: MessageId[] = []

      for (const group of groupsResult.rows) {
        const prefs = await preferenceStore.get(group.user_id, group.channel_name)
        const stillInQuietHours =
          prefs.quietHours !== null && isWithinQuietHours(prefs.quietHours, now())
        if (stillInQuietHours) continue

        const rowsResult = await db.query<PendingRow>(sql`
          select * from ${pending}
          where user_id = ${group.user_id} and channel_name = ${group.channel_name}
          order by created_at asc`)
        const rows = rowsResult.rows
        if (rows.length === 0) continue

        const first = rows[0]
        if (first === undefined) continue
        const oldest = new Date(first.created_at).getTime()
        const windowMs = prefs.grouping === 'immediate' ? 0 : GROUPING_WINDOW_MS[prefs.grouping]
        const due = now() - oldest >= windowMs
        if (!due) continue

        const target = await resolveTarget(group.user_id, group.channel_name)
        if (target !== null) {
          const message: ChannelMessage =
            rows.length === 1 && first !== undefined
              ? buildNotification(`${first.title} — ${first.summary}`)
              : buildReport({
                  title: 'Notifications groupées',
                  keyFigures: [{ label: 'Constats', value: String(rows.length) }],
                  sections: rows.map((row) => ({ heading: row.title, body: row.summary })),
                  moreUrl: buildAdminUrl(group.user_id, group.channel_name),
                })
          sent.push(await sendOne(group.channel_name, target.channelUserId, message))
        }

        await db.query(sql`
          delete from ${pending}
          where user_id = ${group.user_id} and channel_name = ${group.channel_name}`)
      }

      return sent
    },
  }
}
