import { randomUUID } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
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
      // A reset link or an invitation in these files is a credential: the
      // directory and each message are the owner's alone. `mkdir` does not
      // touch a directory that exists already, hence the explicit `chmod`
      // (it can refuse on a directory someone else owns; the files are then
      // still private on their own).
      await mkdir(options.directory, { recursive: true, mode: 0o700 })
      await chmod(options.directory, 0o700).catch(() => undefined)
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
      await writeFile(join(options.directory, `${messageId}.eml.txt`), contents, {
        encoding: 'utf8',
        mode: 0o600,
      })
      return { messageId }
    },
  }
}
