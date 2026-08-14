/**
 * The real, serialized message protocol between the host and an isolated
 * plugin worker. Every field here must survive `worker_threads`' structured
 * clone — no live objects, no functions, no class instances ever cross this
 * boundary ("communication par messages sérialisés. Aucun objet vivant du
 * noyau ne traverse la frontière" — docs/lots/L7-extensibilite.md §
 * Isolation).
 */

/** Host → worker: evaluate `code` inside the sandbox and report the result. */
export interface WorkerRunMessage {
  readonly id: number
  readonly type: 'run'
  readonly code: string
}

export type WorkerHostMessage = WorkerRunMessage

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

export type WorkerGuestMessage = WorkerResultMessage | WorkerErrorMessage
