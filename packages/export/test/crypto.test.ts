import { describe, expect, it } from 'vitest'
import { decryptStream, encryptStream } from '../src/crypto.js'

async function collect(chunks: AsyncGenerator<Buffer>): Promise<Buffer> {
  const parts: Buffer[] = []
  for await (const chunk of chunks) parts.push(chunk)
  return Buffer.concat(parts)
}

describe('encryptStream / decryptStream', () => {
  it('round-trips plaintext through a passphrase, in streamed chunks', async () => {
    const plaintext = [
      Buffer.from('the quick brown fox '),
      Buffer.from('jumps over the lazy dog. '),
      Buffer.from('x'.repeat(10_000)),
    ]

    const ciphertext = await collect(encryptStream(plaintext, 'correct horse battery staple'))
    expect(ciphertext.length).toBeGreaterThan(0)
    // The plaintext must not appear verbatim in the ciphertext.
    expect(ciphertext.includes('quick brown fox')).toBe(false)

    const roundTripped = await collect(decryptStream([ciphertext], 'correct horse battery staple'))
    expect(roundTripped.toString('utf8')).toBe(Buffer.concat(plaintext).toString('utf8'))
  })

  it('refuses to decrypt with the wrong passphrase', async () => {
    const ciphertext = await collect(encryptStream([Buffer.from('secret')], 'right-passphrase'))
    await expect(collect(decryptStream([ciphertext], 'wrong-passphrase'))).rejects.toMatchObject({
      code: 'BACKUP_DECRYPTION_FAILED',
    })
  })

  it('detects tampering (authenticated encryption, not just confidentiality)', async () => {
    const ciphertext = await collect(encryptStream([Buffer.from('untampered')], 'a passphrase'))
    ciphertext[ciphertext.length - 1] = (ciphertext[ciphertext.length - 1] ?? 0) ^ 0xff

    await expect(collect(decryptStream([ciphertext], 'a passphrase'))).rejects.toMatchObject({
      code: 'BACKUP_DECRYPTION_FAILED',
    })
  })

  it('rejects a file with no Cogenta backup header', async () => {
    await expect(
      collect(decryptStream([Buffer.from('not an encrypted backup')], 'whatever')),
    ).rejects.toMatchObject({ code: 'BACKUP_DECRYPTION_FAILED' })
  })

  it('rejects a truncated file', async () => {
    const ciphertext = await collect(encryptStream([Buffer.from('hello world')], 'pw'))
    const truncated = ciphertext.subarray(0, ciphertext.length - 5)
    await expect(collect(decryptStream([truncated], 'pw'))).rejects.toMatchObject({
      code: 'BACKUP_DECRYPTION_FAILED',
    })
  })
})
