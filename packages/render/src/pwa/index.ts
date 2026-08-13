/**
 * PWA layer: manifest, service worker, per-resource cache strategies, offline
 * page, and — the part that has to exist before the first deploy, not after the
 * first incident — a working way to purge the caches and remove the worker.
 *
 * Deliberately dependency-free. Workbox would cover most of this, but it is a
 * large dependency for code we would still have to understand line by line the
 * day a visitor reports stale content, and rule R9 asks for zero dependencies
 * before a small one. What is here is a route table, three caching strategies
 * and a generational purge; the value Workbox adds over that is a build plugin
 * we do not want and a precache manifest we deliberately keep tiny.
 */

export type { PwaArtefacts, PwaBuildInput } from './build.js'
export { buildPwaAssets, DEFAULT_OFFLINE_URL } from './build.js'
export type {
  ClientCacheStorage,
  ClientRegisterOptions,
  ClientRegistration,
  ClientServiceWorkerContainer,
  ClientWorker,
  PwaClientEnvironment,
  PwaResetReport,
} from './client.js'
export {
  DEFAULT_SERVICE_WORKER_URL,
  purgeSiteCaches,
  registerServiceWorker,
  resetPwaClient,
} from './client.js'
export type {
  DisplayMode,
  InstallabilityProblem,
  ManifestIcon,
  ManifestInput,
  WebAppManifest,
} from './manifest.js'
export {
  assertInstallable,
  buildManifest,
  checkInstallability,
  MANIFEST_CONTENT_TYPE,
  renderManifest,
} from './manifest.js'
export type { OfflinePageOptions } from './offline.js'
export { OFFLINE_PAGE_SCRIPT, renderOfflinePage } from './offline.js'
export {
  renderServiceWorker,
  renderTombstoneServiceWorker,
  SERVICE_WORKER_HEADERS,
} from './service-worker.js'
export { chooseStrategy, DEFAULT_ROUTES, IMMUTABLE_ASSET_PATTERN } from './strategy.js'
export type { ServiceWorkerScope } from './sw-runtime.js'
export {
  SW_MESSAGE_ACTIVATED,
  SW_MESSAGE_PURGE,
  SW_MESSAGE_UNREGISTER,
  SW_MESSAGE_UNREGISTERED,
  serviceWorkerMain,
  tombstoneMain,
} from './sw-runtime.js'
export type {
  CacheBucket,
  CacheStrategy,
  PwaConfig,
  RequestDescriptor,
  RouteRule,
  StrategyDecision,
} from './types.js'
export { CACHE_BUCKETS } from './types.js'
export type { ParsedCacheName } from './version.js'
export {
  bucketCacheName,
  cacheNameFor,
  cachesToPurge,
  computeCacheVersion,
  DEFAULT_CACHE_PREFIX,
  parseCacheName,
} from './version.js'
