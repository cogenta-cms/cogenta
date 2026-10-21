import process from 'node:process'

/**
 * The guest that imports a real ES module — a theme sandbox's
 * `theme.render.*` or `theme.config.*` — in a **child process started under
 * Node's permission model** (security review of 2026-10-21).
 *
 * `module-render-entry.mjs` does the same in a worker thread, which shares
 * the host's process: a module written by an agent, or unpacked from a
 * theme ZIP, could reach `node:fs` and `node:child_process` there and read
 * the site's `.env` and database. Here the parent forks with `--permission`,
 * allows reading the sandbox and the installed packages only, and passes an
 * empty environment: a hostile module can compute, and do nothing else
 * of consequence.
 *
 * Two requests: `run-module` (call one export with arguments and host
 * callbacks, the worker's protocol over IPC) and `inspect-module` (which
 * exports are functions, and the default export as plain data — what the
 * host needs to validate a manifest without importing it itself).
 */

if (typeof process.send !== 'function') {
  throw new Error('module-process-entry.mjs must run as a forked child with an IPC channel')
}

const send = process.send.bind(process)

/** A JSON round trip: nothing live crosses back to the host. */
function toSerializable(value) {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

let nextCallId = 1
const pendingCallbackCalls = new Map()

function makeCallback(name) {
  return (...args) =>
    new Promise((resolve, reject) => {
      const callId = nextCallId
      nextCallId += 1
      pendingCallbackCalls.set(callId, { resolve, reject })
      send({ type: 'callback-call', callId, name, args: toSerializable(args) ?? [] })
    })
}

function buildCallbacks(names) {
  const callbacks = {}
  for (const name of names) callbacks[name] = makeCallback(name)
  return callbacks
}

async function handle(message) {
  const mod = await import(message.moduleUrl)
  if (message.type === 'inspect-module') {
    const functions = Object.keys(mod).filter((key) => typeof mod[key] === 'function')
    return {
      functions,
      exports: Object.keys(mod),
      default: toSerializable(mod.default),
      theme: toSerializable(mod.theme),
    }
  }
  const fn = mod[message.exportName]
  if (typeof fn !== 'function') {
    throw new Error(`module has no exported function "${message.exportName}"`)
  }
  return toSerializable(
    await fn(...(message.args ?? []), buildCallbacks(message.callbackNames ?? [])),
  )
}

process.on('message', (message) => {
  if (message == null) return

  if (message.type === 'callback-result' || message.type === 'callback-error') {
    const pending = pendingCallbackCalls.get(message.callId)
    if (pending === undefined) return
    pendingCallbackCalls.delete(message.callId)
    if (message.type === 'callback-result') pending.resolve(message.value)
    else pending.reject(new Error(String(message.message)))
    return
  }

  if (message.type !== 'run-module' && message.type !== 'inspect-module') return
  void handle(message).then(
    (value) => send({ id: message.id, type: 'result', value }),
    (error) =>
      send({
        id: message.id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
  )
})

send({ type: 'guest-ready' })
