import { parentPort } from 'node:worker_threads'
import { runInSandbox, sealed } from './sandbox-core.mjs'

/**
 * The sandbox a plugin's code actually runs in.
 *
 * **Everything the plugin can touch is built inside the `vm` context.** This
 * is the whole security property, and it was not true before 2026-09-16: the
 * context used to receive the worker's own `console`, `Math`, `JSON`,
 * `Promise` and `setTimeout`, and every one of them is an object of the
 * *worker's* realm. `setTimeout.constructor` is that realm's `Function`, so
 * `setTimeout.constructor('return process')()` handed any plugin the real
 * `process` — and with it the filesystem, `child_process`, and the site's
 * own `.env`. `codeGeneration: { strings: false }` never prevented that: it
 * governs code generation *inside* the context, not a constructor reached
 * through an object that came from outside it.
 *
 * So:
 *
 * - `Math`, `JSON`, `Promise` are **not injected**: a fresh context has its
 *   own intrinsics already, and injecting the worker's was both useless and
 *   the escape itself;
 * - `console` and the SDK are **defined by a bootstrap script evaluated
 *   inside the context**, so every object a plugin can see belongs to the
 *   context's realm and every prototype chain it can climb ends there;
 * - the single bridge function the bootstrap needs is given a `null`
 *   prototype (so `bridge.constructor` is `undefined`, not a `Function` of
 *   this realm), is captured in a closure, and is deleted from the context's
 *   global before the plugin's code runs;
 * - values cross the boundary as **JSON strings**, parsed on each side by
 *   that side's own `JSON`. A plain object built in this realm and handed to
 *   the context would carry this realm's `Object.prototype` — and
 *   `value.constructor.constructor` would be an escape all over again.
 *
 * A `vm` context is still not a security boundary on its own (the Node
 * documentation says so, and `docs/05-securite.md` repeats it): this closes
 * the reachable paths, it does not turn a thread into a jail. Running plugins
 * in a process with the permission model is the next step, tracked in
 * `BLOCKERS.md`.
 */

if (!parentPort) {
  throw new Error('sandbox-entry.mjs must run inside a worker_threads Worker')
}

let nextCallId = 1
/** Pending SDK calls this sandbox is waiting on a host reply for, keyed by `callId`. */
const pendingSdkCalls = new Map()

/**
 * The one function the context receives from this realm: it takes and returns
 * JSON strings only, and its prototype is stripped so nothing can climb from
 * it to this realm's `Function`.
 */
const bridge = sealed((method, argsJson) => {
  return new Promise((resolve, reject) => {
    const callId = nextCallId
    nextCallId += 1
    pendingSdkCalls.set(callId, {
      resolve: (value) => resolve(JSON.stringify(value === undefined ? null : value)),
      reject,
    })
    let args
    try {
      args = argsJson === undefined ? undefined : JSON.parse(argsJson)
    } catch {
      args = undefined
    }
    parentPort.postMessage({ type: 'sdk-call', callId, method, args })
  })
})

/**
 * Hands one line to the host on the plugin's behalf, without giving it a real
 * `console`: a plugin's log goes through the host's structured logger, and
 * never to stdout from in here.
 */
const log = sealed((line) => {
  parentPort.postMessage({ type: 'plugin-log', line: String(line).slice(0, 2000) })
})

parentPort.on('message', (message) => {
  if (message == null) return

  // A reply to a pending SDK call — resolve/reject its Promise and let the
  // sandbox's own `await` resume; this is not a new `run` request.
  if (message.type === 'sdk-result' || message.type === 'sdk-error') {
    const pending = pendingSdkCalls.get(message.callId)
    if (pending === undefined) return
    pendingSdkCalls.delete(message.callId)
    if (message.type === 'sdk-result') pending.resolve(message.value)
    else pending.reject(new Error(message.message))
    return
  }

  if (message.type !== 'run') return
  const { id, code, grantedCapabilities, invoke, input, describeHandlers } = message

  void (async () => {
    let result
    try {
      const value = await runInSandbox({
        code,
        grantedCapabilities,
        invoke,
        input,
        describeHandlers,
        bridge,
        log,
      })
      result = { id, type: 'result', value }
    } catch (error) {
      result = {
        id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
    parentPort.postMessage(result)
  })()
})
