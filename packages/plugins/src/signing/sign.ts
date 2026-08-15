import { createPrivateKey, sign as cryptoSign } from 'node:crypto'
import type { PluginManifest } from '../manifest.js'

/**
 * A deterministic, sorted-key JSON rendering of any signable content — the
 * same value always canonicalizes identically regardless of the property
 * insertion order its producer happened to use. Generic over content shape:
 * a plugin manifest (task 9) and a theme submission (task 12) are both real
 * consumers, and neither is more "canonical" a use than the other — this is
 * the one real canonicalization primitive, not one per registry.
 */
export function canonicalizeContent(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

/**
 * A plugin manifest's canonical content — what actually gets signed for a
 * plugin (name, version, capabilities, provides, ...), not just its name: a
 * signature that only covered the name would prove authorship of a label,
 * not of what the plugin is declared to do.
 *
 * Deliberately scoped to the manifest, not the plugin's full package
 * contents (its actual runtime code): `loadPlugin` (task 2) only ever reads
 * the manifest-declaring module today — no mechanism yet reads a plugin's
 * entry-point code into a string a signature could cover, so extending
 * coverage to the full package is a real, separate piece of work for
 * whichever future task builds that code-reading path.
 */
export function canonicalizeManifest(manifest: PluginManifest): string {
  return canonicalizeContent(manifest)
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

/**
 * Signs any canonicalizable content with a real Ed25519 private key (base64
 * PKCS8, `./keys.js`). The publisher-side half of this primitive — a real
 * Cogenta installation never runs this, only the verification half
 * (`./verify.js`) matters there, but both sides must be real for the
 * primitive to be provably correct rather than assumed.
 */
export function signContent(content: unknown, privateKeyBase64: string): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  })
  const data = Buffer.from(canonicalizeContent(content), 'utf8')
  // Ed25519 has no separate digest step — `null` is the documented algorithm
  // argument `crypto.sign` expects for it.
  return cryptoSign(null, data, privateKey).toString('base64')
}

/** Signs a plugin manifest — the task-9 entry point, now a thin wrapper over `signContent`. */
export function signManifest(manifest: PluginManifest, privateKeyBase64: string): string {
  return signContent(manifest, privateKeyBase64)
}
