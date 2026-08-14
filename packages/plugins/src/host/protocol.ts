/**
 * The real, serialized message protocol between the host and an isolated
 * plugin worker. Every field here must survive `worker_threads`' structured
 * clone — no live objects, no functions, no class instances ever cross this
 * boundary ("communication par messages sérialisés. Aucun objet vivant du
 * noyau ne traverse la frontière" — docs/lots/L7-extensibilite.md §
 * Isolation).
 */

/**
 * Host → worker: evaluate `code` inside the sandbox and report the result.
 * `grantedCapabilities` (task 1's manifest capability strings, e.g.
 * `"http.fetch:api.example.com"`) is what the guest-side sandbox uses to
 * decide which SDK methods to construct — task 4's "absent, not refused"
 * property is enforced entirely by which keys this list causes to exist on
 * the sandbox's `sdk` object, never by a present-but-guarded method.
 */
export interface WorkerRunMessage {
  readonly id: number
  readonly type: 'run'
  readonly code: string
  readonly grantedCapabilities: readonly string[]
}

/** Worker → host: the plugin's sandboxed code is calling an SDK method — a real capability request, not yet executed. */
export interface WorkerSdkCallMessage {
  readonly type: 'sdk-call'
  readonly callId: number
  /** The capability name the requested method belongs to, e.g. `"content.read"`, `"http.fetch"`. */
  readonly method: string
  readonly args: unknown
}

export type WorkerHostMessage = WorkerRunMessage

/** Host → worker: the SDK call succeeded — a JSON-safe value only, same "no live object crosses the boundary" rule as every other message here. */
export interface WorkerSdkResultMessage {
  readonly type: 'sdk-result'
  readonly callId: number
  readonly value: unknown
}

/** Host → worker: the SDK call was refused or failed — re-verified host-side, never trusted from the manifest alone. */
export interface WorkerSdkErrorMessage {
  readonly type: 'sdk-error'
  readonly callId: number
  readonly message: string
}

export type WorkerHostReplyMessage = WorkerSdkResultMessage | WorkerSdkErrorMessage

/** Worker → host: `code` completed and returned a JSON-safe value. */
export interface WorkerResultMessage {
  readonly id: number
  readonly type: 'result'
  readonly value: unknown
}

/** Worker → host: `code` threw, or the sandbox itself refused to run it. */
export interface WorkerErrorMessage {
  readonly id: number
  readonly type: 'error'
  readonly message: string
}

export type WorkerGuestMessage = WorkerResultMessage | WorkerErrorMessage | WorkerSdkCallMessage
