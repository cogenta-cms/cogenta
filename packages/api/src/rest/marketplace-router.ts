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
  readonly author?: string
  readonly screenshots?: readonly string[]
  readonly changelog?: readonly {
    readonly version: string
    readonly notes: string
    readonly releasedAt?: string
  }[]
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
  readonly engineCompatible: boolean | null
  readonly latestVersion: string | null
  readonly source: 'registry' | null
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
  readonly enabled: boolean
}

/** Structural mirror of `@cogenta/plugins`' `PluginDisabledRecord` — same reasoning as every other `*Like` type here. */
export interface MarketplacePluginDisabledRecordLike {
  readonly pluginName: string
  readonly reason: 'timeout' | 'memory' | 'crash'
  readonly details: string | null
  readonly disabledAt: string
}

/** Structural mirror of `PluginDisableStore`'s subset this router needs. */
export interface MarketplaceDisableStoreLike {
  isDisabled(pluginName: string): Promise<MarketplacePluginDisabledRecordLike | null>
  enable(pluginName: string): Promise<void>
}

/** Structural mirror of `@cogenta/plugins`' `PluginUsageRecord`. */
export interface MarketplaceUsageRecordLike {
  readonly callCount: number
  readonly totalDurationMs: number
  readonly errorCount: number
  readonly timeoutCount: number
  readonly memoryCount: number
  readonly crashCount: number
  readonly lastRunAt: string
  readonly lastDurationMs: number
  readonly lastOutcome: string
  readonly lastError: string | null
}

export interface MarketplaceUsageStoreLike {
  getUsage(pluginName: string): Promise<MarketplaceUsageRecordLike | null>
}

/** Structural mirror of `PluginGrantStore`'s subset this router needs. */
export interface MarketplaceGrantStoreLike {
  listGrants(pluginName: string): Promise<readonly { readonly capability: string }[]>
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
  uninstall(itemId: string, options?: { readonly removeData?: boolean }): Promise<void>
  activate(itemId: string): Promise<MarketplaceInstallRecordLike>
  deactivate(itemId: string): Promise<MarketplaceInstallRecordLike>
}

export interface MarketplaceRouterOptions {
  readonly catalog: MarketplaceCatalogLike
  readonly installer: MarketplaceInstallerLike
  /** Mount point. `/api/marketplace` by default. */
  readonly basePath?: string
  /**
   * Fiche 29 tasks 1 and 3 — all three optional, and all three absent by
   * default exactly like `@cogenta/plugins`' own `runPlugin` (`usageStore`
   * there is optional for the same reason): a caller with no live
   * disable/usage/grant tracking wired up gets an "installed" view that
   * simply omits those fields, never a crash.
   */
  readonly disableStore?: MarketplaceDisableStoreLike
  readonly usageStore?: MarketplaceUsageStoreLike
  readonly grantStore?: MarketplaceGrantStoreLike
  /** Structural mirror of `@cogenta/plugins`' `describeCapability` — translates a granted capability string to plain language for the "installed" view. */
  readonly describeCapability?: (
    capability: string,
  ) => Omit<MarketplaceCapabilityDescriptionLike, 'capability'>
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
    hint: 'Marketplace routes are /api/marketplace/items, /api/marketplace/items/:id, /api/marketplace/installed and /api/marketplace/updates.',
  })
}

/**
 * A small, self-contained major.minor.patch comparison — the same scope
 * `@cogenta/plugins`' own `compareVersions` covers, not re-imported here to
 * keep this router structurally typed against `@cogenta/plugins` (same
 * reasoning as every `*Like` type above: the dependency arrow only ever
 * points one way). `null` for anything unparseable, which callers treat as
 * "cannot say" rather than guessing.
 */
function isNewerVersion(candidate: string, than: string): boolean {
  const parse = (v: string): readonly [number, number, number] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v)
    if (match === null) return null
    const [, major, minor, patch] = match
    return [Number(major), Number(minor), Number(patch)]
  }
  const a = parse(candidate)
  const b = parse(than)
  if (a === null || b === null) return false
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
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
    author: entry.author ?? null,
    screenshots: entry.screenshots ?? [],
    changelog: entry.changelog ?? [],
    installed: installed !== null,
    installedVersion: installed?.pluginVersion ?? null,
  }
}

interface InstalledUpdateInfo {
  readonly latestVersion: string | null
  readonly updateAvailable: boolean
  /** `true` when applying the available update would request a capability not currently granted — fiche 29's central rule: never bulk-applied. */
  readonly requiresApproval: boolean
}

/**
 * Fiche 29 task 2 — "update available" and "would this update widen
 * permissions" are the same computation whether it feeds the single-item
 * "installed" view or the `/updates` summary: resolve the catalog entry's
 * current manifest via `preview`, compare versions, and compare its full
 * declared capability set against what is actually granted today.
 */
async function updateInfoFor(
  record: MarketplaceInstallRecordLike,
  options: MarketplaceRouterOptions,
): Promise<InstalledUpdateInfo> {
  if (record.kind !== 'plugin' || record.pluginVersion === null) {
    return { latestVersion: null, updateAvailable: false, requiresApproval: false }
  }
  const entry = options.catalog.get(record.itemId)
  if (entry === null)
    return { latestVersion: null, updateAvailable: false, requiresApproval: false }

  const preview = await options.installer.preview(entry)
  if (!preview.supported || preview.error !== undefined || preview.latestVersion === null) {
    return { latestVersion: null, updateAvailable: false, requiresApproval: false }
  }

  const updateAvailable = isNewerVersion(preview.latestVersion, record.pluginVersion)
  if (!updateAvailable || record.pluginName === null) {
    return { latestVersion: preview.latestVersion, updateAvailable, requiresApproval: false }
  }

  const granted =
    options.grantStore === undefined
      ? new Set<string>()
      : new Set((await options.grantStore.listGrants(record.pluginName)).map((g) => g.capability))
  const requiresApproval = preview.capabilities.some((c) => !granted.has(c.capability))

  return { latestVersion: preview.latestVersion, updateAvailable, requiresApproval }
}

async function serialiseInstalled(
  record: MarketplaceInstallRecordLike,
  options: MarketplaceRouterOptions,
): Promise<Record<string, unknown>> {
  const [disabled, usage, updateInfo, grants] = await Promise.all([
    record.pluginName === null || options.disableStore === undefined
      ? Promise.resolve(null)
      : options.disableStore.isDisabled(record.pluginName),
    record.pluginName === null || options.usageStore === undefined
      ? Promise.resolve(null)
      : options.usageStore.getUsage(record.pluginName),
    updateInfoFor(record, options),
    record.pluginName === null || options.grantStore === undefined
      ? Promise.resolve([])
      : options.grantStore.listGrants(record.pluginName),
  ])

  const grantedCapabilities =
    options.describeCapability === undefined
      ? []
      : grants.map((grant) => ({
          capability: grant.capability,
          ...options.describeCapability?.(grant.capability),
        }))

  return {
    itemId: record.itemId,
    kind: record.kind,
    displayName: record.displayName,
    pluginName: record.pluginName,
    pluginVersion: record.pluginVersion,
    signatureVerified: record.signatureVerified,
    installedBy: record.installedBy,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
    enabled: record.enabled,
    disabled,
    usage,
    latestVersion: updateInfo.latestVersion,
    updateAvailable: updateInfo.updateAvailable,
    updateRequiresApproval: updateInfo.requiresApproval,
    grantedCapabilities,
  }
}

export function createMarketplaceRouter(options: MarketplaceRouterOptions): MarketplaceRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()

        const method = request.method.toUpperCase()

        if (segments[0] === 'installed') {
          if (segments.length !== 1) throw noRoute()
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const records = await options.installer.list()
          const data = await Promise.all(
            records.map((record) => serialiseInstalled(record, options)),
          )
          return jsonResponse(200, { data })
        }

        if (segments[0] === 'updates') {
          if (segments.length === 1) {
            if (method !== 'GET') return methodNotAllowed(['GET'])
            const records = await options.installer.list()
            const withInfo = await Promise.all(
              records.map(async (record) => ({
                record,
                info: await updateInfoFor(record, options),
              })),
            )
            const available = withInfo.filter((entry) => entry.info.updateAvailable)
            return jsonResponse(200, {
              data: {
                count: available.length,
                items: available.map(({ record, info }) => ({
                  itemId: record.itemId,
                  displayName: record.displayName,
                  currentVersion: record.pluginVersion,
                  latestVersion: info.latestVersion,
                  requiresApproval: info.requiresApproval,
                })),
              },
            })
          }

          if (segments[1] === 'apply' && segments.length === 2) {
            if (method !== 'POST') return methodNotAllowed(['POST'])
            // Fiche 29's central rule, task 2: grouped update NEVER includes
            // an item that would widen permissions — those stay one-by-one,
            // with their own confirmation, exactly like a single manual
            // update refused with MARKETPLACE_UPDATE_REQUIRES_APPROVAL.
            const records = await options.installer.list()
            const applied: unknown[] = []
            const skipped: unknown[] = []
            const failed: unknown[] = []
            for (const record of records) {
              const info = await updateInfoFor(record, options)
              if (!info.updateAvailable) continue
              if (info.requiresApproval) {
                skipped.push({ itemId: record.itemId, reason: 'requires_approval' })
                continue
              }
              const entry = options.catalog.get(record.itemId)
              if (entry === null) continue
              try {
                const result = await options.installer.update(entry, actor.id)
                applied.push({ itemId: record.itemId, pluginVersion: result.record.pluginVersion })
              } catch (error) {
                failed.push({
                  itemId: record.itemId,
                  message: error instanceof CogentaError ? error.message : 'Update failed.',
                })
              }
            }
            return jsonResponse(200, { data: { applied, skipped, failed } })
          }

          throw noRoute()
        }

        if (segments[0] !== 'items') throw noRoute()
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
              engineCompatible: preview.engineCompatible,
              latestVersion: preview.latestVersion,
              source: preview.source,
              author: entry.author ?? null,
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
          const body = (request.body ?? {}) as { removeData?: unknown }
          const removeData = body.removeData === true
          await options.installer.uninstall(id, { removeData })
          return jsonResponse(200, { data: { id, uninstalled: true, dataRemoved: removeData } })
        }

        if (action === 'activate') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          const record = await options.installer.activate(id)
          return jsonResponse(200, { data: record })
        }

        if (action === 'deactivate') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          const record = await options.installer.deactivate(id)
          return jsonResponse(200, { data: record })
        }

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
