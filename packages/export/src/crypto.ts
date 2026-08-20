import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from 'node:crypto'
import { CogentaError } from '@cogenta/core'

function scrypt(
  passphrase: string,
  salt: Buffer,
  keyLength: number,
  options: { readonly N: number; readonly r: number; readonly p: number; readonly maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(passphrase, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

/** `aes-256-gcm`: authenticated, so a tampered or truncated backup fails to decrypt rather than silently restoring garbage. */
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const SALT_LENGTH = 16
const IV_LENGTH = 12
const TAG_LENGTH = 16
/** `scrypt` cost parameters (RFC 7914's "interactive" profile, scaled up once): memory-hard, so a leaked backup cannot be brute-forced on a GPU as cheaply as a mere iterated hash would allow (rule of thumb: a backup carries every password hash on the site, per the plan's own piège). */
const SCRYPT_N = 2 ** 15
const SCRYPT_R = 8
const SCRYPT_P = 1

const MAGIC = Buffer.from('CGEB1') // "Cogenta Encrypted Backup, v1"

async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return scrypt(passphrase, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  })
}

/**
 * Encrypts a byte stream, never buffering more than one chunk at a time.
 *
 * Framing: `MAGIC(5) | salt(16) | iv(12) | ciphertext(…) | authTag(16)`. The
 * tag trails the ciphertext because GCM only finalises it once every byte has
 * passed through the cipher — putting it up front would require buffering the
 * whole backup first, which is exactly what task 2's "never assembled in
 * memory" rules out.
 */
export async function* encryptStream(
  input: AsyncIterable<Buffer> | Iterable<Buffer>,
  passphrase: string,
): AsyncGenerator<Buffer> {
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const key = await deriveKey(passphrase, salt)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  yield Buffer.concat([MAGIC, salt, iv])

  for await (const chunk of input) {
    const encrypted = cipher.update(chunk)
    if (encrypted.length > 0) yield encrypted
  }
  const final = cipher.final()
  if (final.length > 0) yield final
  yield cipher.getAuthTag()
}

/**
 * Decrypts a stream produced by `encryptStream`. Holds at most one input
 * chunk plus a `TAG_LENGTH`-byte lookback buffer at a time — the lookback is
 * what lets the trailing auth tag be recognised without having read the whole
 * file first.
 */
export async function* decryptStream(
  input: AsyncIterable<Buffer> | Iterable<Buffer>,
  passphrase: string,
): AsyncGenerator<Buffer> {
  const iterator = normalise(input)[Symbol.asyncIterator]()

  let buffered = Buffer.alloc(0)
  const need = async (bytes: number): Promise<boolean> => {
    while (buffered.length < bytes) {
      const next = await iterator.next()
      if (next.done === true) return false
      buffered = Buffer.concat([buffered, next.value])
    }
    return true
  }

  if (!(await need(MAGIC.length + SALT_LENGTH + IV_LENGTH))) {
    throw truncated()
  }
  const magic = buffered.subarray(0, MAGIC.length)
  if (!magic.equals(MAGIC)) {
    throw new CogentaError({
      code: 'BACKUP_DECRYPTION_FAILED',
      message: 'This file is not a Cogenta encrypted backup.',
      hint: 'Decrypt only files produced by `cogenta backup --encrypt`.',
    })
  }
  const salt = buffered.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH)
  const iv = buffered.subarray(MAGIC.length + SALT_LENGTH, MAGIC.length + SALT_LENGTH + IV_LENGTH)
  buffered = buffered.subarray(MAGIC.length + SALT_LENGTH + IV_LENGTH)

  const key = await deriveKey(passphrase, Buffer.from(salt))
  const decipher = createDecipheriv(ALGORITHM, key, iv)

  // Everything from here on is ciphertext, except the final TAG_LENGTH bytes
  // of the whole stream. Only the boundary is uncertain until the stream
  // ends, so at most TAG_LENGTH bytes are ever held back. `buffered` may
  // already hold more than the header when the source handed everything to
  // `need()` in a single chunk (a `Buffer[]` input, in particular) — released
  // right away, rather than only after another `iterator.next()` that may
  // never come.
  const release = (): Buffer | null => {
    if (buffered.length <= TAG_LENGTH) return null
    const releasable = buffered.subarray(0, buffered.length - TAG_LENGTH)
    buffered = buffered.subarray(buffered.length - TAG_LENGTH)
    return releasable
  }

  const initial = release()
  if (initial !== null) {
    const decrypted = decipher.update(initial)
    if (decrypted.length > 0) yield decrypted
  }

  for (;;) {
    const next = await iterator.next()
    if (next.done === true) break
    buffered = Buffer.concat([buffered, next.value])
    const releasable = release()
    if (releasable !== null) {
      const decrypted = decipher.update(releasable)
      if (decrypted.length > 0) yield decrypted
    }
  }

  if (buffered.length !== TAG_LENGTH) throw truncated()
  decipher.setAuthTag(buffered)
  try {
    const final = decipher.final()
    if (final.length > 0) yield final
  } catch (cause) {
    throw new CogentaError({
      code: 'BACKUP_DECRYPTION_FAILED',
      message: 'Decryption failed: the passphrase is wrong or the file was tampered with.',
      hint: 'Re-enter the passphrase used to create this backup, or restore from a different file.',
      cause,
    })
  }
}

function truncated(): CogentaError {
  return new CogentaError({
    code: 'BACKUP_DECRYPTION_FAILED',
    message: 'The encrypted backup is truncated.',
    hint: 'The file was not fully downloaded or copied. Retry the transfer.',
  })
}

async function* normalise(input: AsyncIterable<Buffer> | Iterable<Buffer>): AsyncGenerator<Buffer> {
  for await (const chunk of input) yield chunk
}
