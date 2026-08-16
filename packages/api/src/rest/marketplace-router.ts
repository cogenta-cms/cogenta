import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/marketplace` — L17 tasks 1-4: a consultable catalog of installable
 * plugins/themes/skins/skills, one-click install reusing `@cogenta/plugins`'
 * real Ed25519 verification pipeline, a detail view with plain-language
 * capabilities, and updates that never silently widen permissions.
 *
 * Structural, not `@cogenta/plugins`-typed — same reasoning `agents-router.ts`
 * gives for `@cogenta/agents`: the dependency arrow only ever points one way,
 * and this router calls a handful of methods.
 *
 * Every route is admin-only: a marketplace installs and runs code (R4/R6 —
 * `@cogenta/plugins`' worker isolation and signature verification are the
 * real gate, but *reaching* that gate at all is already a site-changing
 * action, same rule `site-plan-router.ts` applies to a plan that changes the
 * shape of the site).
 */

export interface MarketplaceCatalogEntryLike {
  readonly id: string
  readonly kind: 'plugin' | 'theme' | 'skin' | 'skill'
  readonly displayName: string
  readonly description: string
  readonly category: string
  readonly reference: string
  readonly screenshots?: readonly string[]
  readonly changelog?: readonly { readonly version: string; readonly notes: string }[]
}

export interface MarketplaceCatalogLike {
  list(filter?: {
    readonly kind?: MarketplaceCatalogEntryLike['kind']
    readonly query?: string
  }): readonly MarketplaceCatalogEntryLike[]
  get(id: string): MarketplaceCatalogEntryLike | null
}

export interface MarketplaceCapabilityDescriptionLike {
  readonly capability: string
  readonly sentence: string
  readonly riskLevel: 'low' | 'medium' | 'high'
  readonly category: string
}

export interface MarketplacePreviewLike {
  readonly entry: MarketplaceCatalogEntryLike
  readonly supported: boolean
  readonly signatureVerified: boolean
  readonly capabilities: readonly MarketplaceCapabilityDescriptionLike[]
  readonly error?: { readonly code: string; readonly message: string }
}

export interface MarketplaceInstallRecordLike {
  readonly itemId: string
  readonly kind: MarketplaceCatalogEntryLike['kind']
  readonly displayName: string
  readonly reference: string
  readonly pluginName: string | null
  readonly pluginVersion: string | null
  readonly signatureVerified: boolean
  readonly installedBy: string | null
  readonly installedAt: string
  readonly updatedAt: string
}

export interface MarketplaceUpdateResultLike {
  readonly record: MarketplaceInstallRecordLike
  readonly pendingApproval: readonly MarketplaceCapabilityDescriptionLike[]
}

export interface MarketplaceInstallerLike {
  preview(entry: MarketplaceCatalogEntryLike): Promise<MarketplacePreviewLike>
  install(
    entry: MarketplaceCatalogEntryLike,
    actorId: string | null,
  ): Promise<MarketplaceInstallRecordLike>
  update(
    entry: MarketplaceCatalogEntryLike,
    actorId: string | null,
    options?: { readonly confirmPendingPermissions?: boolean },
  ): Promise<MarketplaceUpdateResultLike>
  list(): Promise<readonly MarketplaceInstallRecordLike[]>
  get(itemId: string): Promise<MarketplaceInstallRecordLike | null>
  uninstall(itemId: string): Promise<void>
}

export interface MarketplaceRouterOptions {
  readonly catalog: MarketplaceCatalogLike
  readonly installer: MarketplaceInstallerLike
  /** Mount point. `/api/marketplace` by default. */
  readonly basePath?: string
}

export interface MarketplaceRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/marketplace'

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may browse or install marketplace items.',
    hint: 'A marketplace item runs code on this site. Ask an administrator.',
  })
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

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'Marketplace routes are /api/marketplace/items, /api/marketplace/items/:id, /api/marketplace/items/:id/install and /api/marketplace/items/:id/update.',
  })
}

function itemNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'MARKETPLACE_ITEM_NOT_FOUND',
    message: `No marketplace item "${id}".`,
    hint: 'Check the id against GET /api/marketplace/items.',
    details: { id },
  })
}

function isKind(value: unknown): value is MarketplaceCatalogEntryLike['kind'] {
  return value === 'plugin' || value === 'theme' || value === 'skin' || value === 'skill'
}

function serialiseEntry(
  entry: MarketplaceCatalogEntryLike,
  installed: MarketplaceInstallRecordLike | null,
): Record<string, unknown> {
  return {
    id: entry.id,
    kind: entry.kind,
    displayName: entry.displayName,
    description: entry.description,
    category: entry.category,
    screenshots: entry.screenshots ?? [],
    changelog: entry.changelog ?? [],
    installed: installed !== null,
    installedVersion: installed?.pluginVersion ?? null,
  }
}

export function createMarketplaceRouter(options: MarketplaceRouterOptions): MarketplaceRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null || segments[0] !== 'items') throw noRoute()

        const method = request.method.toUpperCase()
        const [, id, action] = segments

        if (id === undefined) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const kindRaw = single(request.query, 'kind')
          const kind = isKind(kindRaw) ? kindRaw : undefined
          const query = single(request.query, 'q')
          const entries = options.catalog.list({
            ...(kind === undefined ? {} : { kind }),
            ...(query === undefined ? {} : { query }),
          })
          const installs = await options.installer.list()
          const installedById = new Map(installs.map((record) => [record.itemId, record]))
          return jsonResponse(200, {
            data: entries.map((entry) =>
              serialiseEntry(entry, installedById.get(entry.id) ?? null),
            ),
          })
        }

        const entry = options.catalog.get(id)
        if (entry === null) throw itemNotFound(id)

        if (action === undefined) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const [installed, preview] = await Promise.all([
            options.installer.get(id),
            options.installer.preview(entry),
          ])
          return jsonResponse(200, {
            data: {
              ...serialiseEntry(entry, installed),
              signatureVerified: preview.signatureVerified,
              supported: preview.supported,
              capabilities: preview.capabilities,
              error: preview.error ?? null,
            },
          })
        }

        if (action === 'install') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          const record = await options.installer.install(entry, actor.id)
          return jsonResponse(201, { data: record })
        }

        if (action === 'update') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          const body = (request.body ?? {}) as { confirmPendingPermissions?: unknown }
          const confirmPendingPermissions = body.confirmPendingPermissions === true
          const result = await options.installer.update(entry, actor.id, {
            confirmPendingPermissions,
          })
          return jsonResponse(200, { data: result })
        }

        if (action === 'uninstall') {
          if (method !== 'POST' && method !== 'DELETE') return methodNotAllowed(['POST', 'DELETE'])
          await options.installer.uninstall(id)
          return jsonResponse(200, { data: { id, uninstalled: true } })
        }

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
