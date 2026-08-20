import { CogentaError, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { loadMarketplacePlugin } from '../loader.js'
import { describeCapability, type PluginCapabilityDescription } from '../permissions/describe.js'
import type { PluginDisableStore } from '../permissions/disabled.js'
import type { PluginGrantStore } from '../permissions/grants.js'
import { detectCapabilitiesNeedingApproval } from '../permissions/resolve.js'
import type { PluginUsageStore } from '../permissions/usage.js'
import { MARKETPLACE_TABLES } from './marketplace-tables.js'

/**
 * L17 task 1 — "Registre consultable (recherche, catégories)".
 *
 * Scoped, deliberately, as a **local/embedded** catalog: the lot doc names a
 * dependency on L13 task 8 (API keys) "si la marketplace est un service
 * distinct interrogé par API" — L13 task 8 was never built in this
 * repository, so there is no real remote marketplace service to call. This
 * is an in-memory, read-only directory of installable items the caller
 * assembles (e.g. `@cogenta/cli` wiring already-installed local plugins
 * alongside a small example catalog) — not a second submission-review
 * pipeline like the four `./tables.js` registries, and not a fetch to any
 * external host.
 */
export type MarketplaceItemKind = 'plugin' | 'theme' | 'skin' | 'skill'

export interface MarketplaceChangelogEntry {
  readonly version: string
  readonly notes: string
  /** Fiche 29 task 5 — "date de la dernière mise à jour", read off the newest changelog entry when present. */
  readonly releasedAt?: string
}

export interface MarketplaceCatalogEntry {
  readonly id: string
  readonly kind: MarketplaceItemKind
  readonly displayName: string
  readonly description: string
  /** Free-text category, used for the catalog's category filter. */
  readonly category: string
  /**
   * Opaque to the catalog itself — for `kind: 'plugin'`, an absolute local
   * directory `loadMarketplacePlugin` can resolve. Never interpreted here.
   */
  readonly reference: string
  /** Fiche 29 task 5 — "Auteur, source" shown on the compatibility/trust panel before install. Caller-supplied, deployer-authored catalog metadata; never derived from the manifest (which has no author field). */
  readonly author?: string
  readonly screenshots?: readonly string[]
  readonly changelog?: readonly MarketplaceChangelogEntry[]
}

export interface MarketplaceCatalogFilter {
  readonly kind?: MarketplaceItemKind
  /** Matched, case-insensitively, against `displayName`, `description` and `category`. */
  readonly query?: string
}

export interface MarketplaceCatalog {
  list(filter?: MarketplaceCatalogFilter): readonly MarketplaceCatalogEntry[]
  get(id: string): MarketplaceCatalogEntry | null
}

function matches(entry: MarketplaceCatalogEntry, filter: MarketplaceCatalogFilter): boolean {
  if (filter.kind !== undefined && entry.kind !== filter.kind) return false
  if (filter.query === undefined || filter.query.trim() === '') return true
  const needle = filter.query.trim().toLowerCase()
  return (
    entry.displayName.toLowerCase().includes(needle) ||
    entry.description.toLowerCase().includes(needle) ||
    entry.category.toLowerCase().includes(needle)
  )
}

/** A read-only in-memory catalog over a caller-supplied entry list. */
export function createMarketplaceCatalog(
  entries: readonly MarketplaceCatalogEntry[],
): MarketplaceCatalog {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  return {
    list(filter = {}) {
      return entries.filter((entry) => matches(entry, filter))
    },
    get(id) {
      return byId.get(id) ?? null
    },
  }
}

/** One installed marketplace item, as persisted. */
export interface MarketplaceInstallRecord {
  readonly itemId: string
  readonly kind: MarketplaceItemKind
  readonly displayName: string
  readonly reference: string
  readonly pluginName: string | null
  readonly pluginVersion: string | null
  readonly signatureVerified: boolean
  readonly installedBy: string | null
  readonly installedAt: string
  readonly updatedAt: string
  /** Fiche 29 task 1 — the manual activate/deactivate toggle, independent of `@cogenta/plugins`' automatic `PluginDisableStore` (a timeout/memory/crash violation, task 6 of L7). Both can make a plugin non-runnable; this is only the human-chosen half. */
  readonly enabled: boolean
}

/** What viewing an item's "fiche détaillée" (task 3) needs, before installing. */
export interface MarketplacePreview {
  readonly entry: MarketplaceCatalogEntry
  readonly supported: boolean
  readonly signatureVerified: boolean
  readonly capabilities: readonly (PluginCapabilityDescription & { readonly capability: string })[]
  /** Set when resolution/verification failed — the real `CogentaError` code, e.g. `PLUGIN_SIGNATURE_INVALID`. */
  readonly error?: { readonly code: string; readonly message: string }
  /**
   * Fiche 29 task 5 — "Version de Cogenta requise, vérifiée avant
   * l'installation, avec un refus clair". `null` only when resolution
   * itself failed (`error` is set) — there is no manifest to check
   * compatibility against. Computed by `loadMarketplacePlugin` from the
   * `engineVersion` this installer was constructed with; `install`/`update`
   * refuse honestly (`MARKETPLACE_ENGINE_INCOMPATIBLE`) rather than let an
   * incompatible plugin fail at runtime instead.
   */
  readonly engineCompatible: boolean | null
  /** The resolvable manifest's own version — `null` only when resolution failed. Compared against an installed item's `pluginVersion` to answer "is an update available" (task 2). */
  readonly latestVersion: string | null
  /** Fiche 29 task 5 — "source". Always `'registry'` when `supported`: `install`/`update` always call `loadMarketplacePlugin`, which classifies every marketplace item as registry-trust regardless of whether its `reference` happens to be a local path (see that function's own doc comment). */
  readonly source: 'registry' | null
}

export interface MarketplaceUpdateResult {
  readonly record: MarketplaceInstallRecord
  /** Newly-declared capabilities the previous grants don't cover — never auto-granted, ever. */
  readonly pendingApproval: readonly (PluginCapabilityDescription & {
    readonly capability: string
  })[]
}

export interface MarketplaceInstaller {
  /** Resolves and verifies signature — never installs, never throws for a bad signature (returns it in `error`). */
  preview(entry: MarketplaceCatalogEntry): Promise<MarketplacePreview>
  /**
   * Installs one catalog entry. **Only `kind: 'plugin'` is supported** —
   * L17's own "pièges connus" line ("une marketplace est une nouvelle
   * surface de confiance") is specifically about code execution, which only
   * a plugin does; theme/skin/skill installation is out of scope for this
   * pass and refused honestly (`MARKETPLACE_KIND_UNSUPPORTED`) rather than
   * silently accepted with no real verification behind it.
   *
   * Always calls `loadMarketplacePlugin`, which always requires (and
   * verifies) a signature — there is no parameter here, and none upstream,
   * that can skip that call. A missing or invalid signature throws the real
   * `PLUGIN_SIGNATURE_MISSING`/`PLUGIN_SIGNATURE_INVALID` and nothing is
   * persisted.
   */
  install(entry: MarketplaceCatalogEntry, actorId: string | null): Promise<MarketplaceInstallRecord>
  /**
   * Re-verifies signature against a (possibly new) catalog entry for an
   * already-installed item. If the resolved manifest declares a capability
   * no existing grant covers, the update is refused
   * (`MARKETPLACE_UPDATE_REQUIRES_APPROVAL`) unless the caller passes
   * `confirmPendingPermissions: true` — and even then, no capability is
   * granted here: `PluginGrantStore.grant` is a separate, explicit step, so
   * "confirming" only unblocks the version bump, never auto-grants.
   */
  update(
    entry: MarketplaceCatalogEntry,
    actorId: string | null,
    options?: { readonly confirmPendingPermissions?: boolean },
  ): Promise<MarketplaceUpdateResult>
  list(): Promise<readonly MarketplaceInstallRecord[]>
  get(itemId: string): Promise<MarketplaceInstallRecord | null>
  /**
   * Fiche 29 task 4 — "désinstallation propre". `removeData: true` also
   * revokes every active capability grant for the plugin
   * (`PluginGrantStore.revokeAll`) and, when a disable/usage store was
   * supplied to this installer, clears its auto-disable record and
   * accumulated resource usage — irreversible, matching the router's own
   * "confirmation forte" for this path. Without it (the default), only the
   * install row is removed: grants, the disable record and usage history
   * all survive, which is what makes a later reinstall able to pick up
   * exactly where the plugin left off.
   */
  uninstall(itemId: string, options?: { readonly removeData?: boolean }): Promise<void>
  /** Fiche 29 task 1 — the manual half of "activer/désactiver" (`MarketplaceInstallRecord.enabled`). Activating an item still auto-disabled (`PluginDisableStore`) does not by itself make it runnable again — that decision is `PluginDisableStore.enable`'s, deliberately kept a separate, explicit action (the router composes both). */
  activate(itemId: string): Promise<MarketplaceInstallRecord>
  deactivate(itemId: string): Promise<MarketplaceInstallRecord>
}

export interface MarketplaceInstallerOptions {
  readonly trustedPublicKeys?: readonly string[]
  readonly grantStore: PluginGrantStore
  readonly now?: () => number
  /**
   * Cogenta's own version, checked against a resolved manifest's `engine`
   * range (fiche 29 task 5). Passed straight through to
   * `loadMarketplacePlugin` — see `LoadPluginOptions.engineVersion` for why
   * the default is an honest placeholder rather than a fabricated pass.
   */
  readonly engineVersion?: string
  /** Fiche 29 task 4 — only consulted by `uninstall(id, { removeData: true })`; a plain uninstall never touches either store. */
  readonly disableStore?: PluginDisableStore
  readonly usageStore?: PluginUsageStore
}

interface InstallRow {
  item_id: string
  kind: string
  display_name: string
  reference: string
  plugin_name: string | null
  plugin_version: string | null
  signature_verified: string
  installed_by: string | null
  installed_at: string
  updated_at: string
  enabled: string | null
}

function toRecord(row: InstallRow): MarketplaceInstallRecord {
  return {
    itemId: row.item_id,
    kind: row.kind as MarketplaceItemKind,
    displayName: row.display_name,
    reference: row.reference,
    pluginName: row.plugin_name,
    pluginVersion: row.plugin_version,
    signatureVerified: row.signature_verified === 'true',
    installedBy: row.installed_by,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
    // `enabled` is nullable at the SQL level only because a row created
    // before fiche 29's `alter table ... add column` ran has no explicit
    // value in older engines that ignore `default` on backfill — treated as
    // "still active", matching every pre-existing install's real state.
    enabled: row.enabled !== 'false',
  }
}

function engineIncompatible(
  entry: MarketplaceCatalogEntry,
  manifest: { engine: string },
): CogentaError {
  return new CogentaError({
    code: 'MARKETPLACE_ENGINE_INCOMPATIBLE',
    message: `"${entry.displayName}" requires Cogenta "${manifest.engine}", which this installation does not satisfy.`,
    hint: 'Upgrade Cogenta, or choose a version of this item compatible with the current installation.',
    details: { itemId: entry.id, engine: manifest.engine },
  })
}

function unsupportedKind(entry: MarketplaceCatalogEntry): CogentaError {
  return new CogentaError({
    code: 'MARKETPLACE_KIND_UNSUPPORTED',
    message: `The marketplace does not install "${entry.kind}" items yet — only "plugin".`,
    hint: 'Themes, skins and skills go through their own registries (@cogenta/plugins’ createThemeRegistry/createSkinGallery/createSkillRegistry) for now.',
    details: { itemId: entry.id, kind: entry.kind },
  })
}

function describeAll(
  capabilities: readonly string[],
): readonly (PluginCapabilityDescription & { readonly capability: string })[] {
  return capabilities.map((capability) => ({ capability, ...describeCapability(capability) }))
}

export function createMarketplaceInstaller(
  db: DatabaseHandle,
  options: MarketplaceInstallerOptions,
): MarketplaceInstaller {
  const installs = identifier(MARKETPLACE_TABLES.installs, db.dialect)
  const now = options.now ?? Date.now
  const trustedPublicKeys = options.trustedPublicKeys ?? []
  const grantStore = options.grantStore
  const engineVersion = options.engineVersion

  async function getRecord(itemId: string): Promise<MarketplaceInstallRecord | null> {
    const result = await db.query<InstallRow>(sql`
      select * from ${installs} where item_id = ${itemId}`)
    const row = result.rows[0]
    return row === undefined ? null : toRecord(row)
  }

  async function setEnabled(itemId: string, enabled: boolean): Promise<MarketplaceInstallRecord> {
    await db.query(sql`
      update ${installs} set enabled = ${String(enabled)}, updated_at = ${new Date(now()).toISOString()}
      where item_id = ${itemId}`)
    const record = await getRecord(itemId)
    if (record === null) {
      throw new CogentaError({
        code: 'MARKETPLACE_NOT_INSTALLED',
        message: `"${itemId}" is not installed.`,
        hint: 'Install it first.',
        details: { itemId },
      })
    }
    return record
  }

  async function resolveOrError(entry: MarketplaceCatalogEntry): Promise<
    | {
        readonly ok: true
        readonly manifest: {
          name: string
          version: string
          engine: string
          capabilities: readonly string[]
        }
        readonly signatureVerified: boolean
        /**
         * `null` when this installer was never given a real
         * `engineVersion` — `loadMarketplacePlugin`'s own placeholder
         * default (`0.0.0`) would make `satisfiesRange` return `false`
         * against almost every real `engine` range, which is a fabricated
         * "incompatible" verdict, not an honest one. Only ever a real
         * `true`/`false` once a caller configures a real Cogenta version.
         */
        readonly engineCompatible: boolean | null
      }
    | { readonly ok: false; readonly error: { code: string; message: string } }
  > {
    try {
      const resolved = await loadMarketplacePlugin(entry.reference, {
        trustedPublicKeys,
        ...(engineVersion === undefined ? {} : { engineVersion }),
      })
      return {
        ok: true,
        manifest: resolved.manifest,
        signatureVerified: resolved.signatureVerified,
        engineCompatible: engineVersion === undefined ? null : resolved.engineCompatible,
      }
    } catch (error) {
      if (error instanceof CogentaError) {
        return { ok: false, error: { code: error.code, message: error.message } }
      }
      throw error
    }
  }

  return {
    async preview(entry) {
      if (entry.kind !== 'plugin') {
        return {
          entry,
          supported: false,
          signatureVerified: false,
          capabilities: [],
          engineCompatible: null,
          latestVersion: null,
          source: null,
        }
      }
      const resolution = await resolveOrError(entry)
      if (!resolution.ok) {
        return {
          entry,
          supported: true,
          signatureVerified: false,
          capabilities: [],
          error: resolution.error,
          engineCompatible: null,
          latestVersion: null,
          source: null,
        }
      }
      return {
        entry,
        supported: true,
        signatureVerified: resolution.signatureVerified,
        capabilities: describeAll(resolution.manifest.capabilities),
        engineCompatible: resolution.engineCompatible,
        latestVersion: resolution.manifest.version,
        source: 'registry',
      }
    },

    async install(entry, actorId) {
      if (entry.kind !== 'plugin') throw unsupportedKind(entry)

      // Never a soft catch here: an invalid/missing signature throws and
      // nothing below runs — this is the one line the whole task hinges on.
      const resolved = await loadMarketplacePlugin(entry.reference, {
        trustedPublicKeys,
        ...(engineVersion === undefined ? {} : { engineVersion }),
      })

      // Fiche 29 task 5 — refused BEFORE anything is persisted, exactly
      // like the signature check above: an incompatible version never gets
      // a chance to fail later at runtime instead. Only enforced once this
      // installer was configured with a real `engineVersion` — see
      // `resolveOrError`'s doc comment for why the default placeholder
      // must never manufacture a refusal.
      if (engineVersion !== undefined && !resolved.engineCompatible) {
        throw engineIncompatible(entry, resolved.manifest)
      }

      const timestamp = new Date(now()).toISOString()
      // Delete-then-insert rather than a dialect-specific upsert (`on
      // conflict` on Postgres/SQLite, `on duplicate key` on MySQL) — the
      // same portable idiom `PluginGrantStore.grant` already uses
      // (`../permissions/grants.js`) for the identical "re-installing is
      // idempotent, not a duplicate row" requirement. A (re)install always
      // resets `enabled` to `true` — a fresh install is never born disabled.
      await db.query(sql`delete from ${installs} where item_id = ${entry.id}`)
      await db.query(sql`
        insert into ${installs}
          (item_id, kind, display_name, reference, plugin_name, plugin_version,
           signature_verified, installed_by, installed_at, updated_at, enabled)
        values
          (${entry.id}, ${entry.kind}, ${entry.displayName}, ${entry.reference},
           ${resolved.manifest.name}, ${resolved.manifest.version},
           ${String(resolved.signatureVerified)}, ${actorId}, ${timestamp}, ${timestamp}, ${'true'})`)

      return {
        itemId: entry.id,
        kind: entry.kind,
        displayName: entry.displayName,
        reference: entry.reference,
        pluginName: resolved.manifest.name,
        pluginVersion: resolved.manifest.version,
        signatureVerified: resolved.signatureVerified,
        installedBy: actorId,
        installedAt: timestamp,
        updatedAt: timestamp,
        enabled: true,
      }
    },

    async update(entry, actorId, updateOptions = {}) {
      if (entry.kind !== 'plugin') throw unsupportedKind(entry)

      const existing = await getRecord(entry.id)
      if (existing === null) {
        throw new CogentaError({
          code: 'MARKETPLACE_NOT_INSTALLED',
          message: `"${entry.displayName}" is not installed, so it cannot be updated.`,
          hint: 'Install it first.',
          details: { itemId: entry.id },
        })
      }

      // Signature is verified before anything else here too — an update
      // never trusts the previously-installed state as a substitute for
      // re-checking the new reference.
      const resolved = await loadMarketplacePlugin(entry.reference, {
        trustedPublicKeys,
        ...(engineVersion === undefined ? {} : { engineVersion }),
      })

      if (engineVersion !== undefined && !resolved.engineCompatible) {
        throw engineIncompatible(entry, resolved.manifest)
      }

      const previousGrants =
        existing.pluginName === null ? [] : await grantStore.listGrants(existing.pluginName)
      const pending = detectCapabilitiesNeedingApproval(
        resolved.manifest,
        previousGrants.map((grant) => grant.capability),
      )

      if (pending.length > 0 && updateOptions.confirmPendingPermissions !== true) {
        throw new CogentaError({
          code: 'MARKETPLACE_UPDATE_REQUIRES_APPROVAL',
          message: `Updating "${entry.displayName}" would request ${pending.length} new permission(s) — this never applies silently.`,
          hint: 'Review the new permissions and retry with confirmPendingPermissions: true. No capability is granted automatically even then — grant it explicitly afterward.',
          details: { itemId: entry.id, pending },
        })
      }

      const timestamp = new Date(now()).toISOString()
      await db.query(sql`
        update ${installs} set
          display_name = ${entry.displayName},
          reference = ${entry.reference},
          plugin_name = ${resolved.manifest.name},
          plugin_version = ${resolved.manifest.version},
          signature_verified = ${String(resolved.signatureVerified)},
          installed_by = ${actorId},
          updated_at = ${timestamp}
        where item_id = ${entry.id}`)

      const record = await getRecord(entry.id)
      if (record === null) {
        throw new CogentaError({
          code: 'MARKETPLACE_NOT_INSTALLED',
          message: `"${entry.displayName}" disappeared during its own update.`,
          hint: 'Retry the update.',
          details: { itemId: entry.id },
        })
      }

      return { record, pendingApproval: describeAll(pending) }
    },

    async list() {
      const result = await db.query<InstallRow>(sql`
        select * from ${installs} order by installed_at asc`)
      return result.rows.map(toRecord)
    },

    async get(itemId) {
      return getRecord(itemId)
    },

    async uninstall(itemId, uninstallOptions = {}) {
      if (uninstallOptions.removeData === true) {
        const record = await getRecord(itemId)
        if (record?.pluginName !== null && record?.pluginName !== undefined) {
          await grantStore.revokeAll(record.pluginName)
          await options.disableStore?.enable(record.pluginName)
          await options.usageStore?.clearUsage(record.pluginName)
        }
      }
      await db.query(sql`delete from ${installs} where item_id = ${itemId}`)
    },

    async activate(itemId) {
      return setEnabled(itemId, true)
    },

    async deactivate(itemId) {
      return setEnabled(itemId, false)
    },
  }
}
