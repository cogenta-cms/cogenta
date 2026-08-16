import { createHmac } from 'node:crypto'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { runServe } from '../../src/commands/serve.js'
import { createOutput } from '../../src/output.js'

/**
 * What every `cogenta serve` end-to-end test needs: a real server on a real
 * port, and a real signed-in session to talk to it with.
 *
 * Extracted here rather than copied because more than one suite needs the
 * MFA dance — a role that can publish is always MFA-sensitive
 * (`packages/auth/src/mfa.ts`), so no test that writes content can skip it.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Independent RFC 6238 implementation — see packages/auth/test/helpers/totp-code.ts for why. */
export function codeFor(secret: string, nowSeconds: number): string {
  const normalised = secret.toUpperCase().replace(/=+$/u, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of normalised) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  const key = Buffer.from(bytes)

  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(nowSeconds / 30)))
  const digest = createHmac('sha1', key).update(counter).digest()
  const offset = (digest.at(-1) ?? 0) & 0x0f
  const truncated =
    ((digest[offset] ?? 0) & 0x7f) * 2 ** 24 +
    ((digest[offset + 1] ?? 0) & 0xff) * 2 ** 16 +
    ((digest[offset + 2] ?? 0) & 0xff) * 2 ** 8 +
    ((digest[offset + 3] ?? 0) & 0xff)
  return String(truncated % 1_000_000).padStart(6, '0')
}

/**
 * Signs in a user whose role can publish. Kept its original name across the
 * test suites that call it, even though what it does changed: since
 * ADR-0021, a password alone is enough — MFA is a recommendation the admin
 * shows, never a setup gate at sign-in (`packages/auth/src/login.ts`'s
 * `LoginResult` returns `status: 'session'` directly for an account with no
 * enrolled factor; `mfa_required` only challenges one that already enrolled
 * one). Returns the bearer token.
 */
export async function loginWithMfaSetup(
  base: string,
  email: string,
  password: string,
): Promise<string> {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const loginBody = (await login.json()) as {
    data: { status: string; session?: { token: string } }
  }
  if (loginBody.data.status !== 'session' || loginBody.data.session === undefined) {
    throw new Error(`expected session, got ${loginBody.data.status}`)
  }
  return loginBody.data.session.token
}

/** Creates a real user with a real password hash, against the site's own database. */
export async function createUser(
  root: string,
  email: string,
  password: string,
  roles: readonly string[],
): Promise<void> {
  const { createSqliteHandle } = await import('@cogenta/core')
  const { createUserStore, createCredentialStore, ensureAuthTables } = await import('@cogenta/auth')
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureAuthTables(db)
  const users = createUserStore(db)
  const credentials = createCredentialStore(db)
  const user = await users.create({ email, roles })
  await credentials.setPassword(user.id, password)
  await db.close()
}

export interface RunningServer {
  readonly base: string
  stop(): Promise<void>
}

export interface StartServerOptions {
  readonly readOnly?: boolean
  /** `cogenta dev` rather than `cogenta serve` — the only thing that lets a site plan be applied (ADR-0010). */
  readonly development?: boolean
  /** Collected so a test can assert the server is registered for cleanup. */
  readonly registry?: AbortController[]
  /**
   * Merged on top of the signing key every server needs. A suite that exercises
   * an environment-only setting (a webhook secret, a storage credential) sets
   * it here rather than touching the real `process.env`, which would leak
   * between test files running in the same worker.
   */
  readonly env?: Record<string, string | undefined>
  /** Overrides the 60s cadence `runServe` drains scheduled-publication jobs on — see `ServeOptions.scheduledPublishTickMs`. */
  readonly scheduledPublishTickMs?: number
}

export async function startServer(
  root: string,
  options: StartServerOptions = {},
): Promise<RunningServer> {
  const controller = new AbortController()
  options.registry?.push(controller)

  let resolveAddress: (value: { port: number; host: string }) => void
  const address = new Promise<{ port: number; host: string }>((resolve) => {
    resolveAddress = resolve
  })

  const done = runServe({
    cwd: root,
    env: {
      COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret',
      ...options.env,
    },
    logger: createLogger({ level: 'silent' }),
    out: createOutput(() => undefined, false),
    stderr: () => undefined,
    port: 0,
    signal: controller.signal,
    onListening: (a) => resolveAddress(a),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    ...(options.development === undefined ? {} : { development: options.development }),
    ...(options.scheduledPublishTickMs === undefined
      ? {}
      : { scheduledPublishTickMs: options.scheduledPublishTickMs }),
  })
  // If startup fails before ever listening, `address` would hang forever —
  // race it against the command's own exit so that case fails fast instead.
  const bound = await Promise.race([
    address,
    done.then((code) => {
      throw new Error(`runServe exited with code ${code} before it started listening`)
    }),
  ])

  return {
    base: `http://${bound.host}:${bound.port}`,
    stop: async () => {
      controller.abort()
      await done
    },
  }
}
