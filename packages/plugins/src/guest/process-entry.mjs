import process from 'node:process'
import { runInSandbox, sealed } from './sandbox-core.mjs'

/**
 * The plugin guest that runs in a **child process started under Node's
 * permission model** (L31, after the security review of 2026-09-16).
 *
 * A worker thread shares the host's process: escaping the `vm` there gives
 * the real `process`, and with it the filesystem and `child_process`. The
 * escapes that made that reachable are closed, but a `vm` context is not a
 * security boundary on its own — the Node documentation says so, and so does
 * `docs/05-securite.md`. This is the boundary: the parent forks with
 * `--permission` and allows reading exactly this directory, so even a total
 * escape lands in a process that cannot read a file, spawn a command, or see
 * one environment variable.
 *
 * The protocol is the worker's, over IPC instead of `postMessage`, so the
 * host speaks one language to either guest.
 */

if (typeof process.send !== 'function') {
  throw new Error('process-entry.mjs must run as a forked child with an IPC channel')
}

const send = process.send.bind(process)
let nextCallId = 1
const pendingSdkCalls = new Map()

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
    send({ type: 'sdk-call', callId, method, args })
  })
})

const log = sealed((line) => {
  send({ type: 'plugin-log', line: String(line).slice(0, 2000) })
})

process.on('message', (message) => {
  if (message == null) return

  if (message.type === 'sdk-result' || message.type === 'sdk-error') {
    const pending = pendingSdkCalls.get(message.callId)
    if (pending === undefined) return
    pendingSdkCalls.delete(message.callId)
    if (message.type === 'sdk-result') pending.resolve(message.value)
    else pending.reject(new Error(message.message))
    return
  }

  if (message.type !== 'run') return
  const { id } = message

  void (async () => {
    try {
      const value = await runInSandbox({ ...message, bridge, log })
      send({ id, type: 'result', value })
    } catch (error) {
      send({
        id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })()
})

send({ type: 'guest-ready' })
