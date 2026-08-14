import type { StorageDriver } from '@cogenta/core'
import { CogentaError } from '@cogenta/core'

/**
 * Host-side implementations of the SDK methods a sandboxed plugin can call.
 * "Commencer minimal" (docs/lots/L7-extensibilite.md § Pièges connus) — this
 * is a deliberately small starter set: `content.read`, `http.fetch`,
 * `storage.read`/`storage.write`. Task 5 owns turning a real permission grant
 * into the `grantedCapabilities` list these handlers re-verify against; this
 * file owns what each capability actually DOES once granted.
 *
 * Every handler re-checks the SPECIFIC request against the SPECIFIC granted
 * capability parameter (the exact domain, the exact storage prefix) — never
 * just "was this capability name granted at all." The manifest schema
 * (task 1) already validates that a declared capability's parameter is
 * well-formed (a real hostname, a prefix confined to the plugin's own
 * namespace), but a well-formed *declaration* says nothing about what the
 * *specific call a plugin makes at runtime* asks for — a plugin granted
 * `http.fetch:api.example.com` could still ask its own SDK method to fetch
 * `evil.example.com`, and only a host-side re-check of the actual request
 * against the actual granted parameter closes that gap.
 */

export interface CapabilityCallContext {
  /** The full manifest-shaped capability strings actually granted, e.g. `["http.fetch:api.example.com"]`. */
  readonly grantedCapabilities: readonly string[]
}

export type CapabilityHandler = (args: unknown, context: CapabilityCallContext) => Promise<unknown>

/** Parameters (the part after `:`) granted for a given bare capability name. */
function grantedParameters(name: string, context: CapabilityCallContext): readonly string[] {
  const prefix = `${name}:`
  return context.grantedCapabilities
    .filter((capability) => capability.startsWith(prefix))
    .map((capability) => capability.slice(prefix.length))
}

function refused(message: string): never {
  throw new CogentaError({
    code: 'PLUGIN_CAPABILITY_REFUSED',
    message,
    hint: 'The plugin requested something its granted capabilities do not cover.',
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object') refused('expected an object argument')
  return value as Record<string, unknown>
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    refused(`"${field}" must be a non-empty string`)
  return value
}

/**
 * `content.read` — read-only, via whatever real content-read function the
 * host provides (typically `ContentStore.read`, `@cogenta/schema`) for a
 * single, specific collection this plugin instance is scoped to. No
 * per-call re-verification beyond capability presence: `content.read` is
 * bare (task 1 never parameterizes it per-collection), so the host, not
 * this handler, is what decides which collection's store gets wired in.
 */
export function createContentReadHandler(
  readEntry: (id: string) => Promise<unknown>,
): CapabilityHandler {
  return async (args, context) => {
    if (!context.grantedCapabilities.includes('content.read')) {
      refused('"content.read" was not granted')
    }
    const id = asString(asRecord(args).id, 'id')
    return await readEntry(id)
  }
}

/**
 * `http.fetch:<domain>` — the requested URL's hostname must exactly match
 * one of the domains actually granted, re-checked here against the real
 * request, not merely against the fact that *some* `http.fetch` capability
 * exists.
 */
export function createHttpFetchHandler(fetchImpl: typeof fetch = fetch): CapabilityHandler {
  return async (args, context) => {
    const url = asString(asRecord(args).url, 'url')
    const allowedDomains = grantedParameters('http.fetch', context)
    const hostname = new URL(url).hostname
    if (!allowedDomains.includes(hostname)) {
      refused(`"http.fetch" was not granted for domain "${hostname}"`)
    }
    const response = await fetchImpl(url)
    const body = await response.text()
    return { status: response.status, body }
  }
}

function isWithinGrantedPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Refuses any request whose normalised path escapes what the granted prefix set allows — closes `../` traversal. */
function normalisedStorageKey(rawKey: string): string {
  const key = asString(rawKey, 'key')
  const segments = key.split('/')
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    refused(`storage key "${key}" must not contain "." or ".." segments`)
  }
  return key
}

/** `storage.read:<prefix>` — the requested key must fall within a granted prefix, re-verified per call. */
export function createStorageReadHandler(driver: StorageDriver): CapabilityHandler {
  return async (args, context) => {
    const record = asRecord(args)
    const key = normalisedStorageKey(asString(record.key, 'key'))
    const allowedPrefixes = grantedParameters('storage.read', context)
    if (!isWithinGrantedPrefix(key, allowedPrefixes)) {
      refused(`"storage.read" was not granted for key "${key}"`)
    }
    const readable = await driver.get(key)
    const chunks: Buffer[] = []
    for await (const chunk of readable) {
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks).toString('utf8')
  }
}

/** `storage.write:<prefix>` — same per-call prefix re-verification as `storage.read`. */
export function createStorageWriteHandler(driver: StorageDriver): CapabilityHandler {
  return async (args, context) => {
    const record = asRecord(args)
    const key = normalisedStorageKey(asString(record.key, 'key'))
    const content = asString(record.content, 'content')
    const allowedPrefixes = grantedParameters('storage.write', context)
    if (!isWithinGrantedPrefix(key, allowedPrefixes)) {
      refused(`"storage.write" was not granted for key "${key}"`)
    }
    await driver.put(key, Buffer.from(content, 'utf8'))
    return { ok: true }
  }
}
