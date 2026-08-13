/**
 * The page side of the PWA: registration, and the way out.
 *
 * These functions take the browser objects as arguments instead of reaching for
 * `navigator` and `caches`. That is what lets them be unit-tested at all — the
 * package compiles without the DOM library — and it keeps the surface the code
 * depends on down to the six methods declared here. A caller in the admin (L2)
 * passes `navigator.serviceWorker` and `caches`; the real objects satisfy these
 * interfaces structurally, with no cast.
 */

export interface ClientCacheStorage {
  keys(): Promise<string[]>
  delete(name: string): Promise<boolean>
}

export interface ClientWorker {
  postMessage(message: unknown): void
}

export interface ClientRegistration {
  unregister(): Promise<boolean>
  update(): Promise<void>
  readonly active: ClientWorker | null
}

export interface ClientRegisterOptions {
  readonly scope?: string
  /**
   * `'none'` means the *script* is never answered from the HTTP cache, only its
   * imports may be. Without it, a worker script cached by an over-eager CDN
   * cannot be updated: the daily update check compares the new script against a
   * stale copy and concludes nothing changed.
   */
  readonly updateViaCache?: 'none' | 'imports' | 'all'
}

export interface ClientServiceWorkerContainer {
  register(url: string, options?: ClientRegisterOptions): Promise<ClientRegistration>
  getRegistrations(): Promise<readonly ClientRegistration[]>
  readonly controller: ClientWorker | null
}

/** What a page hands in. Both entries are absent on unsupporting browsers. */
export interface PwaClientEnvironment {
  readonly serviceWorker?: ClientServiceWorkerContainer | undefined
  readonly caches?: ClientCacheStorage | undefined
}

export const DEFAULT_SERVICE_WORKER_URL = '/sw.js'

/**
 * Registers the worker at the root scope.
 *
 * Returns `null` rather than throwing when the browser has no service worker
 * support, or when registration fails: a site that renders on the server does
 * not stop working because an offline nicety could not be installed (rule R1
 * applied to the browser).
 */
export async function registerServiceWorker(
  container: ClientServiceWorkerContainer | undefined,
  options: { readonly scriptUrl?: string; readonly scope?: string } = {},
): Promise<ClientRegistration | null> {
  if (container === undefined) return null
  try {
    return await container.register(options.scriptUrl ?? DEFAULT_SERVICE_WORKER_URL, {
      scope: options.scope ?? '/',
      updateViaCache: 'none',
    })
  } catch {
    return null
  }
}

export interface PwaResetReport {
  /** Registrations that reported themselves removed. */
  readonly registrationsRemoved: number
  readonly cachesDeleted: readonly string[]
  /**
   * True when a worker was controlling the page. An unregistered worker keeps
   * controlling already-loaded pages until they are reloaded, so the caller
   * must reload for the reset to be visible. Saying so is the difference
   * between a button that works and a button that appears not to.
   */
  readonly reloadRequired: boolean
  /** False when the browser has no service worker or no Cache Storage. */
  readonly supported: boolean
}

/**
 * Deletes the caches this site owns. Names outside `cachePrefix` are left
 * alone: another application may share the origin, and deleting a neighbour's
 * cache is a worse incident than the stale content this is fixing.
 */
export async function purgeSiteCaches(
  cacheStorage: ClientCacheStorage | undefined,
  cachePrefix: string,
): Promise<string[]> {
  if (cacheStorage === undefined) return []
  const names = await cacheStorage.keys()
  const mine = names.filter((name) => name.startsWith(`${cachePrefix}:`))
  await Promise.all(mine.map((name) => cacheStorage.delete(name)))
  return mine
}

/**
 * The "clear client cache" button of the admin, as a function.
 *
 * The order is deliberate. The active worker is asked to purge and unregister
 * itself first, because it is the only party that can empty its caches while it
 * is still running. Then the registrations are unregistered from the page side,
 * which also covers a worker that is broken, hung, or from a build that never
 * understood the message. Only then are the remaining caches deleted directly —
 * doing that first would simply let the still-running worker refill them.
 *
 * Even after all of this the current page is still controlled by the old
 * worker, which is why the report insists on a reload.
 */
export async function resetPwaClient(
  environment: PwaClientEnvironment,
  cachePrefix: string,
): Promise<PwaResetReport> {
  const container = environment.serviceWorker
  const cacheStorage = environment.caches
  const supported = container !== undefined && cacheStorage !== undefined
  const controlled = container?.controller != null

  let registrationsRemoved = 0
  if (container !== undefined) {
    const registrations = await container.getRegistrations()
    for (const registration of registrations) {
      registration.active?.postMessage({ type: 'cogenta:unregister' })
    }
    const results = await Promise.all(
      registrations.map((registration) => registration.unregister().catch(() => false)),
    )
    registrationsRemoved = results.filter((removed) => removed).length
  }

  const cachesDeleted = await purgeSiteCaches(cacheStorage, cachePrefix)

  return { registrationsRemoved, cachesDeleted, reloadRequired: controlled, supported }
}
