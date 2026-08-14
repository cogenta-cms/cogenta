import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import type { ChannelSeverity } from '../adapter.js'
import { PREFERENCE_TABLES } from './tables.js'
import {
  CHANNEL_EVENT_TYPES,
  type ChannelEventType,
  type ChannelPreferences,
  DEFAULT_CHANNEL_PREFERENCES,
  type GroupingMode,
} from './types.js'

export interface PreferenceStore {
  get(userId: string, channelName: string): Promise<ChannelPreferences>
  set(userId: string, channelName: string, preferences: ChannelPreferences): Promise<void>
}

interface PreferenceRow {
  id: string
  user_id: string
  channel_name: string
  event_types: string
  min_severity: string
  quiet_start_minute: number | null
  quiet_end_minute: number | null
  grouping: string
  updated_at: string
}

function isEventType(value: string): value is ChannelEventType {
  return (CHANNEL_EVENT_TYPES as readonly string[]).includes(value)
}

function invalid(message: string, hint: string): CogentaError {
  return new CogentaError({ code: 'CHANNEL_PREFERENCES_INVALID', message, hint })
}

function validate(preferences: ChannelPreferences): void {
  for (const eventType of preferences.eventTypes) {
    if (!isEventType(eventType)) {
      throw invalid(
        `"${eventType}" is not a known channel event type.`,
        `Use one of: ${CHANNEL_EVENT_TYPES.join(', ')}.`,
      )
    }
  }
  const { quietHours } = preferences
  if (quietHours !== null) {
    for (const [label, minute] of [
      ['startMinute', quietHours.startMinute],
      ['endMinute', quietHours.endMinute],
    ] as const) {
      if (!Number.isInteger(minute) || minute < 0 || minute > 1439) {
        throw invalid(
          `quietHours.${label} must be an integer between 0 and 1439 (minutes since local midnight), got ${minute}.`,
          'Pick a minute-of-day in [0, 1439], or set quietHours to null to disable it.',
        )
      }
    }
  }
}

function rowToPreferences(row: PreferenceRow): ChannelPreferences {
  return {
    eventTypes: row.event_types.split(',').filter((v) => v.length > 0) as ChannelEventType[],
    minSeverity: row.min_severity as ChannelSeverity,
    quietHours:
      row.quiet_start_minute === null || row.quiet_end_minute === null
        ? null
        : { startMinute: row.quiet_start_minute, endMinute: row.quiet_end_minute },
    grouping: row.grouping as GroupingMode,
  }
}

export function createPreferenceStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): PreferenceStore {
  const preferences = identifier(PREFERENCE_TABLES.preferences, db.dialect)

  return {
    async get(userId, channelName) {
      const result = await db.query<PreferenceRow>(
        sql`select * from ${preferences} where user_id = ${userId} and channel_name = ${channelName}`,
      )
      const row = result.rows[0]
      return row === undefined ? DEFAULT_CHANNEL_PREFERENCES : rowToPreferences(row)
    },

    async set(userId, channelName, next) {
      validate(next)
      const updatedAt = new Date(now()).toISOString()
      await db.query(
        sql`delete from ${preferences} where user_id = ${userId} and channel_name = ${channelName}`,
      )
      await db.query(sql`
        insert into ${preferences}
          (id, user_id, channel_name, event_types, min_severity, quiet_start_minute, quiet_end_minute, grouping, updated_at)
        values (
          ${newId(now)}, ${userId}, ${channelName}, ${next.eventTypes.join(',')}, ${next.minSeverity},
          ${next.quietHours?.startMinute ?? null}, ${next.quietHours?.endMinute ?? null}, ${next.grouping}, ${updatedAt}
        )`)
    },
  }
}
