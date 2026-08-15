import { generateKeyPairSync, type KeyObject } from 'node:crypto'

/**
 * A real Ed25519 key pair, base64-encoded (SPKI for the public half, PKCS8
 * for the private half) — small, fast, natively supported by `node:crypto`
 * since well before this project's Node 22 LTS baseline. Asymmetric, not
 * the HMAC scheme `@cogenta/channels`' approval links use (L6 task 5):
 * a registry signs once, and every independent Cogenta installation must be
 * able to verify without ever holding the signing secret — a shared-secret
 * scheme cannot do that.
 */
export interface SigningKeyPair {
  readonly publicKey: string
  readonly privateKey: string
}

export function generateSigningKeyPair(): SigningKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: exportPublicKey(publicKey),
    privateKey: exportPrivateKey(privateKey),
  }
}

export function exportPublicKey(key: KeyObject): string {
  return key.export({ type: 'spki', format: 'der' }).toString('base64')
}

export function exportPrivateKey(key: KeyObject): string {
  return key.export({ type: 'pkcs8', format: 'der' }).toString('base64')
}
