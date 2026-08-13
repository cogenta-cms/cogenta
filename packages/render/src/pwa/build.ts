import type { ManifestInput, WebAppManifest } from './manifest.js'
import { assertInstallable, buildManifest, renderManifest } from './manifest.js'
import type { OfflinePageOptions } from './offline.js'
import { renderOfflinePage } from './offline.js'
import { renderServiceWorker, renderTombstoneServiceWorker } from './service-worker.js'
import { DEFAULT_ROUTES } from './strategy.js'
import type { PwaConfig, RouteRule } from './types.js'
import { computeCacheVersion, DEFAULT_CACHE_PREFIX } from './version.js'

/**
 * One call that produces every PWA artefact a build has to emit, so that the
 * manifest, the service worker and the offline page cannot disagree about the
 * offline URL, the cache prefix or the generation. They disagreed in every
 * hand-wired PWA any of us has debugged.
 */

export const DEFAULT_OFFLINE_URL = '/offline.html'

export interface PwaBuildInput {
  readonly manifest: ManifestInput
  readonly offline: OfflinePageOptions
  /** Commit sha, build timestamp — anything that changes when content does. */
  readonly buildId: string
  readonly offlineUrl?: string
  readonly cachePrefix?: string
  /** Extra URLs to precache. Keep this list short: it is downloaded on install. */
  readonly precache?: readonly string[]
  readonly routes?: readonly RouteRule[]
}

export interface PwaArtefacts {
  readonly config: PwaConfig
  readonly manifest: WebAppManifest
  /** Contents of `manifest.webmanifest`. */
  readonly manifestJson: string
  /** Contents of the service worker script. Serve with SERVICE_WORKER_HEADERS. */
  readonly serviceWorker: string
  /**
   * The worker that removes the PWA. Emitted on every build, never served by
   * default: an exit path you have to write during an incident is an exit path
   * you do not have.
   */
  readonly tombstoneServiceWorker: string
  /** Contents of the offline page, at `config.offlineUrl`. */
  readonly offlineHtml: string
}

export function buildPwaAssets(input: PwaBuildInput): PwaArtefacts {
  const manifest = buildManifest(input.manifest)
  // Refuse at build time. A manifest that silently fails to install is
  // discovered weeks later by someone reading a Lighthouse report.
  assertInstallable(manifest)

  const offlineUrl = input.offlineUrl ?? DEFAULT_OFFLINE_URL
  const routes = input.routes ?? DEFAULT_ROUTES
  const precache = [offlineUrl, ...(input.precache ?? [])]
  const version = computeCacheVersion({ offlineUrl, precache, routes, buildId: input.buildId })

  const config: PwaConfig = {
    cachePrefix: input.cachePrefix ?? DEFAULT_CACHE_PREFIX,
    version,
    offlineUrl,
    precache,
    routes,
  }

  return {
    config,
    manifest,
    manifestJson: renderManifest(manifest),
    serviceWorker: renderServiceWorker(config),
    tombstoneServiceWorker: renderTombstoneServiceWorker(config.cachePrefix),
    offlineHtml: renderOfflinePage(input.offline),
  }
}
