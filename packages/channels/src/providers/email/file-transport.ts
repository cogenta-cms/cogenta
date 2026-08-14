import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EmailTransport, OutgoingEmail, SentEmail } from './transport.js'

export interface FileEmailTransportOptions {
  /** Directory an outgoing message is written into — created if missing. */
  readonly directory: string
}

/**
 * The degraded, no-external-service `EmailTransport` (R1) — writes each
 * message as a real file (subject/to headers plus both bodies) rather than
 * sending it anywhere. Useful for local development and for driving real
 * tests without a network, exactly like `StorageDriver`'s local filesystem
 * implementation stands in for S3/R2/MinIO.
 */
export function createFileEmailTransport(options: FileEmailTransportOptions): EmailTransport {
  return {
    async send(email: OutgoingEmail): Promise<SentEmail> {
      await mkdir(options.directory, { recursive: true })
      const messageId = randomUUID()
      const contents = [
        `To: ${email.to}`,
        `Subject: ${email.subject}`,
        `Message-Id: ${messageId}`,
        '',
        '--- text/plain ---',
        email.text,
        '',
        '--- text/html ---',
        email.html,
        '',
      ].join('\n')
      await writeFile(join(options.directory, `${messageId}.eml.txt`), contents, 'utf8')
      return { messageId }
    },
  }
}
