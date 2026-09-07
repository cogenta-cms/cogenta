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

/**
 * Host → worker: fiche 73 task 3's real deliverable — import a real ES
 * module (a theme's `theme.render.*`, in the fiche's own use case) inside
 * the worker and call one of its named export functions.
 *
 * This is deliberately a DIFFERENT primitive from `WorkerRunMessage`, not an
 * option on it: `run` executes a code *string* as a classic, import-less
 * `vm.Script` — the actual isolation boundary for arbitrary untrusted logic
 * (docs/lots/L7-extensibilite.md § Isolation). A theme's render module is a
 * real ES module with real `import` statements (`@cogenta/theme-kit`, its
 * own block renderers) that `vm.Script` cannot load at all without a full
 * bundling step this fiche does not attempt. `run-module` instead lets the
 * worker's own, real module loader do a genuine `await import(moduleUrl)` —
 * safety here comes from a DIFFERENT, weaker combination than `run`'s: (1)
 * `verifyTheme`'s static scan already refused any forbidden import in the
 * module's *source* before this message is ever sent (task 1), and (2) the
 * same worker-level protections `run` already has — empty `env`, bounded
 * `resourceLimits`, a host-side timeout. There is no `vm` boundary blocking
 * `node:fs`/`node:net` *inside this worker* the way there is for `run` — an
 * explicit, named gap, not an oversight (ADR-0034's own "point de
 * vigilance").
 */
export interface WorkerRunModuleMessage {
  readonly id: number
  readonly type: 'run-module'
  /** A `file://` URL — the worker does its own real `import()`, so this must resolve on disk exactly as `loadTheme` already resolved it host-side. */
  readonly moduleUrl: string
  readonly exportName: string
  /** Structured-cloneable positional arguments — plain data, same rule as everywhere else on this boundary. */
  readonly args: readonly unknown[]
  /**
   * Names of host callbacks the call is allowed to invoke while it runs,
   * e.g. `["t", "image", "link", "content.entry"]` for a theme's
   * `RenderContext` — the same request/reply RPC shape `sdk-call` already
   * proves for plugin capabilities (`callback-call` below), generalised
   * past the plugin-specific `namespace.method` capability vocabulary. The
   * guest builds one flat callback object with exactly these keys and
   * nothing else; what a caller does with that object (assembling it into
   * a `RenderContext`-shaped value, say) is the caller's own business, not
   * this protocol's.
   */
  readonly callbackNames: readonly string[]
}

export type WorkerHostMessage = WorkerRunMessage | WorkerRunModuleMessage

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

/** Host → worker: a `callback-call` succeeded — the `run-module` analogue of `sdk-result`. */
export interface WorkerCallbackResultMessage {
  readonly type: 'callback-result'
  readonly callId: number
  readonly value: unknown
}

/** Host → worker: a `callback-call` threw host-side. */
export interface WorkerCallbackErrorMessage {
  readonly type: 'callback-error'
  readonly callId: number
  readonly message: string
}

export type WorkerHostReplyMessage =
  | WorkerSdkResultMessage
  | WorkerSdkErrorMessage
  | WorkerCallbackResultMessage
  | WorkerCallbackErrorMessage

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

/** Worker → host: `run-module`'s callback object is calling one of its named host callbacks — `run`'s `sdk-call`, generalised past plugin capability names. */
export interface WorkerCallbackCallMessage {
  readonly type: 'callback-call'
  readonly callId: number
  readonly name: string
  readonly args: readonly unknown[]
}

export type WorkerGuestMessage =
  | WorkerResultMessage
  | WorkerErrorMessage
  | WorkerSdkCallMessage
  | WorkerCallbackCallMessage
