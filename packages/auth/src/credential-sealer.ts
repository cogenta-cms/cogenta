import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { CogentaError } from '@cogenta/core'

/**
 * Authenticated encryption for the credential rows whose content *is* the
 * secret (pentest 2026-11-01, AUTH-03): a TOTP secret, active or pending. A
 * password hash is already one-way and a passkey's public key is public; a TOTP
 * secret is neither, and anyone who reads it can compute every future code.
 *
 * The key is derived from `COGENTA_AUTH_SIGNING_KEY` with HKDF under a label of
 * its own — never a second secret to provision (R7), and never the signing key
 * itself, so a break of one use does not hand over the other. AES-256-GCM, as
 * the provider keys at rest (`@cogenta/agents`). Each value carries its own
 * random nonce and is bound to its row (`context` is the owner and the kind),
 * so a ciphertext copied onto another account's row does not open.
 *
 * Stored form: `enc:v1:<iv>.<tag>.<ciphertext>`, each part base64url. The
 * version lets the algorithm or the key derivation change later while old rows
 * still read; a value without the prefix is a legacy plaintext row.
 */
const PREFIX = 'enc:v1:'
const SALT = 'cogenta-auth-credential-sealer'
const INFO = 'cogenta/auth/totp-secrets/v1'
const ALGORITHM = 'aes-256-gcm'
const NONCE_BYTES = 12

export interface CredentialSealer {
  /** True for a value written by `seal`; false for a legacy plaintext row. */
  isSealed(stored: string): boolean
  seal(plaintext: string, context: string): string
  /** Throws `AUTH_CREDENTIAL_KEY_INVALID` when the value does not open under this key and context. */
  open(stored: string, context: string): string
}

function unreadable(cause?: unknown): CogentaError {
  return new CogentaError({
    code: 'AUTH_CREDENTIAL_KEY_INVALID',
    message: 'A stored authenticator secret could not be decrypted.',
    hint: 'COGENTA_AUTH_SIGNING_KEY is not the key these secrets were written with. Restore the previous key; changing it makes every enrolled authenticator unreadable (recovery codes still work once an operator removes the factor).',
    ...(cause === undefined ? {} : { cause }),
  })
}

export function createCredentialSealer(signingKey: string): CredentialSealer {
  const key = Buffer.from(hkdfSync('sha256', signingKey, SALT, INFO, 32))

  return {
    isSealed: (stored) => stored.startsWith(PREFIX),

    seal: (plaintext, context) => {
      const nonce = randomBytes(NONCE_BYTES)
      const cipher = createCipheriv(ALGORITHM, key, nonce)
      cipher.setAAD(Buffer.from(context, 'utf8'))
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      return `${PREFIX}${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`
    },

    open: (stored, context) => {
      if (!stored.startsWith(PREFIX)) throw unreadable()
      const [nonce, tag, ciphertext] = stored.slice(PREFIX.length).split('.')
      if (nonce === undefined || tag === undefined || ciphertext === undefined) throw unreadable()
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(nonce, 'base64url'))
        decipher.setAAD(Buffer.from(context, 'utf8'))
        decipher.setAuthTag(Buffer.from(tag, 'base64url'))
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8')
      } catch (error) {
        throw unreadable(error)
      }
    },
  }
}
