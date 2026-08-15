import { createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { PluginManifest } from '../manifest.js'
import { canonicalizeContent } from './sign.js'

/**
 * Public keys of registries this installation trusts. Empty: no real
 * plugin registry exists anywhere yet (this whole lot is pre-alpha,
 * `loadPlugin`'s own `engineVersion` default documents the same honest
 * gap). An empty list is the correct, honest default — every `registry`
 * -source plugin fails verification until a real registry key is added
 * here or passed explicitly via `LoadPluginOptions.trustedPublicKeys` —
 * never a placeholder key that would make verification silently vacuous.
 */
export const TRUSTED_REGISTRY_PUBLIC_KEYS: readonly string[] = []

/**
 * Verifies a base64 Ed25519 signature against any canonicalizable content
 * and a base64 SPKI public key. Real, standard verification —
 * `crypto.verify` returns `false` on any mismatch (wrong key, tampered
 * content, malformed signature bytes) rather than throwing, except for a
 * structurally invalid key/signature, which this function treats the same
 * way: not verified, never an uncaught exception.
 */
export function verifyContentSignature(
  content: unknown,
  signatureBase64: string,
  publicKeyBase64: string,
): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    })
    const data = Buffer.from(canonicalizeContent(content), 'utf8')
    const signature = Buffer.from(signatureBase64, 'base64')
    return cryptoVerify(null, data, publicKey, signature)
  } catch {
    return false
  }
}

/** Verifies a plugin manifest's signature — the task-9 entry point, now a thin wrapper. */
export function verifyManifestSignature(
  manifest: PluginManifest,
  signatureBase64: string,
  publicKeyBase64: string,
): boolean {
  return verifyContentSignature(manifest, signatureBase64, publicKeyBase64)
}

/**
 * A signature verifies if it matches ANY trusted key — one registry
 * operator's key rotation, or several trusted registries, both work without
 * this function's caller needing to know which key actually signed.
 */
export function verifyContentAgainstTrustedKeys(
  content: unknown,
  signatureBase64: string | null,
  trustedPublicKeys: readonly string[],
): boolean {
  if (signatureBase64 === null) return false
  return trustedPublicKeys.some((key) => verifyContentSignature(content, signatureBase64, key))
}

/** Verifies a plugin manifest against trusted keys — the task-9 entry point, now a thin wrapper. */
export function verifyPluginSignature(
  manifest: PluginManifest,
  signatureBase64: string | null,
  trustedPublicKeys: readonly string[],
): boolean {
  return verifyContentAgainstTrustedKeys(manifest, signatureBase64, trustedPublicKeys)
}

/**
 * A signature travels as a sibling file next to the manifest
 * (`plugin.manifest.mjs.sig`), a single base64 line — never embedded in the
 * manifest object itself, so signing never changes the manifest's own
 * shape (the lot doc's literal `definePlugin({...})` example carries no
 * signature field, and it shouldn't need one: the manifest is signed, not
 * self-describing its own signature).
 */
export async function readSignatureFile(manifestPath: string): Promise<string | null> {
  try {
    const content = await readFile(`${manifestPath}.sig`, 'utf8')
    const trimmed = content.trim()
    return trimmed === '' ? null : trimmed
  } catch {
    return null
  }
}
