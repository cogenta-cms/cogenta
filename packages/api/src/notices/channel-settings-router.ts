import type { ChannelLinkStore, ChannelPreferences, PreferenceStore } from '@cogenta/channels'
import { CogentaError } from '@cogenta/core'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from '../rest/http.js'
import type { Actor } from '../types.js'

/**
 * `/api/notices/channels` — fiche 38 tasks 3-4: linking a channel to receive
 * notices, and per-channel notification preferences.
 *
 * Deliberately thin: `ChannelLinkStore` and `PreferenceStore` (`@cogenta/
 * channels`, L6) already do the real work — one-time linking codes, hashed
 * and TTL'd; validated, per-`(user, channel)` preferences. This router does
 * not reimplement either; it exposes them to the admin the same way every
 * other `@cogenta/api` router exposes an `@cogenta/schema` store. No route
 * here can read or write another account's channels or preferences — every
 * query is scoped to the actor the bearer token resolved to (R4), the same
 * rule `router.ts` states for notices themselves.
 */

export interface NoticeChannelSettingsRouterOptions {
  readonly linkStore: ChannelLinkStore
  readonly preferenceStore: PreferenceStore
  readonly basePath?: string
}

export interface NoticeChannelSettingsRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/notices/channels'

function signedOut(): CogentaError {
  return new CogentaError({
    code: 'UNAUTHENTICATED',
    message: 'Channel settings are personal: sign in to see yours.',
    hint: 'Send "Authorization: Bearer <token>" from an existing session.',
  })
}

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'Routes are GET /api/notices/channels, POST .../{name}/link-code, DELETE .../{name}, GET|PUT .../{name}/preferences.',
  })
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null
  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
}

function invalidPreferences(message: string): CogentaError {
  return new CogentaError({
    code: 'CHANNEL_PREFERENCES_INVALID',
    message,
    hint: 'Send eventTypes (a non-empty array of strings), minSeverity ("info"|"warning"|"critical"), grouping ("immediate"|"hourly"|"daily"), and quietHours (null, or {startMinute, endMinute}).',
  })
}

function parsePreferences(body: unknown): ChannelPreferences {
  if (typeof body !== 'object' || body === null)
    throw invalidPreferences('The request body must be an object.')
  const record = body as Record<string, unknown>

  const eventTypes = record['eventTypes']
  const minSeverity = record['minSeverity']
  const grouping = record['grouping']
  const quietHours = record['quietHours']

  if (
    !Array.isArray(eventTypes) ||
    !eventTypes.every((v) => typeof v === 'string') ||
    typeof minSeverity !== 'string' ||
    typeof grouping !== 'string'
  ) {
    throw invalidPreferences('"eventTypes", "minSeverity" and "grouping" are required.')
  }
  if (quietHours !== null && typeof quietHours !== 'object') {
    throw invalidPreferences('"quietHours" must be null or an object with startMinute/endMinute.')
  }

  const parsedQuietHours =
    quietHours === null || quietHours === undefined
      ? null
      : {
          startMinute: Number((quietHours as Record<string, unknown>)['startMinute']),
          endMinute: Number((quietHours as Record<string, unknown>)['endMinute']),
        }

  return {
    eventTypes: eventTypes as ChannelPreferences['eventTypes'],
    minSeverity: minSeverity as ChannelPreferences['minSeverity'],
    grouping: grouping as ChannelPreferences['grouping'],
    quietHours: parsedQuietHours,
  }
}

export function createNoticeChannelSettingsRouter(
  options: NoticeChannelSettingsRouterOptions,
): NoticeChannelSettingsRouter {
  const { linkStore, preferenceStore } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()

        if (actor.id === null) throw signedOut()
        const userId = actor.id

        if (segments.length === 0) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const linked = await linkStore.listLinkedChannels(userId)
          return jsonResponse(200, { data: linked })
        }

        const channelName = segments[0] ?? ''

        if (segments.length === 2 && segments[1] === 'link-code') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          const generated = await linkStore.generateCode(userId, channelName)
          return jsonResponse(201, { data: generated })
        }

        if (segments.length === 2 && segments[1] === 'preferences') {
          if (method === 'GET') {
            const preferences = await preferenceStore.get(userId, channelName)
            return jsonResponse(200, { data: preferences })
          }
          if (method === 'PUT') {
            const preferences = parsePreferences(request.body)
            await preferenceStore.set(userId, channelName, preferences)
            return jsonResponse(200, { data: preferences })
          }
          return methodNotAllowed(['GET', 'PUT'])
        }

        if (segments.length === 1) {
          if (method !== 'DELETE') return methodNotAllowed(['DELETE'])
          // `revoke` takes the channel-side identifier, not the Cogenta user
          // id — look it up among this person's own links first, so nothing
          // here can revoke a link that does not belong to `actor`.
          const linked = await linkStore.listLinkedChannels(userId)
          const target = linked.find((link) => link.channelName === channelName)
          if (target !== undefined) {
            await linkStore.revoke(channelName, target.channelUserId)
          }
          return { status: 204, body: null, headers: {} }
        }

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
