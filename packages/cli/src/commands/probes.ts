import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from '@cogenta/core'

/**
 * `GET /livez` and `GET /readyz` — the two probes an orchestrator (Kubernetes,
 * Docker, a load balancer) needs, and that `/api/health` cannot be because it
 * is admin-only.
 *
 * - `/livez`: the process is up and the event loop answers. No I/O at all, so
 *   a slow database never gets a healthy pod killed.
 * - `/readyz`: the database answers a trivial query. 503 otherwise, and 503
 *   while the server is shutting down so traffic drains before the socket
 *   closes.
 *
 * Anonymous by design, and therefore stingy: a bare word, no driver names, no
 * versions, no error text. They answer before the security headers, the
 * session lookup, the request quota and the page router, so they are never
 * rate limited, never negotiate a Content-Security-Policy, never become a 404
 * in the log and never show up as a trace every five seconds. The price is
 * that these two paths are reserved: a page whose slug is `livez` or `readyz`
 * is unreachable.
 */

export const LIVENESS_PATH = '/livez'
export const READINESS_PATH = '/readyz'

/** How long the database may take to answer before the pod is reported unready. */
export const READINESS_TIMEOUT_MS = 3000

export interface ProbeOptions {
  /** Resolves when the database answered; rejects (or never settles) otherwise. */
  readonly ping: () => Promise<unknown>
  readonly logger: Logger
  /** Aborted when the server begins to shut down. */
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

function reply(req: IncomingMessage, res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(body),
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

async function databaseAnswers(options: ProbeOptions): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      options.ping(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('readiness check timed out')),
          options.timeoutMs ?? READINESS_TIMEOUT_MS,
        )
      }),
    ])
    return true
  } catch (error) {
    options.logger.warn('readiness probe failed', { error: String(error) })
    return false
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Returns a handler that answers a probe request and resolves `true`, or
 * resolves `false` for any other request without touching it.
 */
export function createProbeHandler(
  options: ProbeOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    const path = (req.url ?? '/').split('?', 1)[0]
    if (path !== LIVENESS_PATH && path !== READINESS_PATH) return false

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' }).end()
      return true
    }

    if (path === LIVENESS_PATH) {
      reply(req, res, 200, 'ok')
      return true
    }

    if (options.signal?.aborted === true || !(await databaseAnswers(options))) {
      reply(req, res, 503, 'unavailable')
      return true
    }
    reply(req, res, 200, 'ok')
    return true
  }
}
