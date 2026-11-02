import { CogentaError } from '../errors/index.js'

/**
 * Reading the body of a response somebody else controls.
 *
 * `await response.text()` and `await response.arrayBuffer()` answer "give me
 * everything, however long it takes and however large it is" — and checking
 * the size afterwards, or the `Content-Length` header the remote end wrote,
 * checks nothing: by then the whole body is in memory, and a chunked reply
 * carries no length at all. A bound that matters is applied while the bytes
 * arrive: count them, stop pulling at the limit, and cancel the stream so the
 * connection is torn down rather than drained.
 *
 * The clock has the same problem. A timeout that is cleared when the response
 * *headers* arrive protects nothing against a server that then sends a byte a
 * minute, so the deadline here runs until the last byte was read.
 */

export interface ReadBoundedBodyOptions {
  /** The most bytes to accept. */
  readonly maxBytes: number
  /**
   * What reaching the limit means. `'throw'` for a caller that cannot use half
   * a file (`HTTP_BODY_TOO_LARGE`); `'truncate'` for one that reports a
   * prefix and says so (`truncated: true` in the result).
   */
  readonly onLimit: 'throw' | 'truncate'
  /** Total time allowed for reading the body, from the first read. */
  readonly timeoutMs?: number
  /** The caller's cancellation, honoured even while the remote end is silent. */
  readonly signal?: AbortSignal
}

export interface BoundedBody {
  readonly bytes: Uint8Array
  /** `true` only with `onLimit: 'truncate'`, when the body held more than `maxBytes`. */
  readonly truncated: boolean
}

export async function readBoundedBody(
  response: Response,
  options: ReadBoundedBodyOptions,
): Promise<BoundedBody> {
  const body = response.body
  if (body === null) return { bytes: new Uint8Array(0), truncated: false }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  let finished = false

  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  // Rejects when the deadline passes or the caller cancels; raced against
  // every read, so a stream that never delivers cannot hold this function.
  const interrupted = new Promise<never>((_resolve, reject) => {
    if (options.timeoutMs !== undefined) {
      timer = setTimeout(
        () =>
          reject(
            new CogentaError({
              code: 'HTTP_BODY_TIMEOUT',
              message: `The response body was not fully received within ${options.timeoutMs}ms.`,
              hint: 'The remote server is too slow. Try again later or fetch a smaller resource.',
            }),
          ),
        options.timeoutMs,
      )
    }
    const signal = options.signal
    if (signal !== undefined) {
      onAbort = () =>
        reject(
          new CogentaError({
            code: 'HTTP_BODY_ABORTED',
            message: 'Reading the response body was cancelled.',
            hint: 'The caller gave up on this request.',
          }),
        )
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
  })
  // Settled or not, a rejection nobody is racing must not become an
  // unhandled one.
  interrupted.catch(() => undefined)

  try {
    for (;;) {
      // A read that is already satisfied beats a rejection raced against it, so
      // a caller that cancelled first is checked for explicitly.
      if (options.signal?.aborted === true) await interrupted
      const next = await Promise.race([reader.read(), interrupted])
      if (next.done) {
        finished = true
        break
      }
      const chunk = next.value
      if (total + chunk.byteLength > options.maxBytes) {
        if (options.onLimit === 'throw') {
          throw new CogentaError({
            code: 'HTTP_BODY_TOO_LARGE',
            message: `The response body is larger than the ${options.maxBytes} byte limit.`,
            hint: 'Fetch a smaller resource.',
            details: { maxBytes: options.maxBytes },
          })
        }
        chunks.push(chunk.subarray(0, options.maxBytes - total))
        total = options.maxBytes
        truncated = true
        break
      }
      chunks.push(chunk)
      total += chunk.byteLength
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    if (onAbort !== undefined) options.signal?.removeEventListener('abort', onAbort)
    // Not awaited: against a stalled stream `cancel()` may take as long as the
    // remote end chooses, and stopping is the point. Cancelling is what makes
    // the underlying connection close instead of keep downloading.
    if (!finished) void reader.cancel().catch(() => undefined)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, truncated }
}

/** {@link readBoundedBody}, decoded as UTF-8 (invalid sequences become U+FFFD). */
export async function readBoundedText(
  response: Response,
  options: ReadBoundedBodyOptions,
): Promise<{ readonly text: string; readonly truncated: boolean }> {
  const { bytes, truncated } = await readBoundedBody(response, options)
  return { text: new TextDecoder('utf-8').decode(bytes), truncated }
}
