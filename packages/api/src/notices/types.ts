import type { Actor } from '../types.js'

/**
 * Admin notices — L11 task 2, ADR-0021.
 *
 * A notice is a recommendation the admin shows to the person signed in. It is
 * modelled on what WordPress does with its security and update reminders, and
 * it obeys two rules that are the whole point of the mechanism:
 *
 *  - It never blocks. A notice is something on a screen, not a gate in front of
 *    one. The MFA recommendation exists precisely because the gate it replaces
 *    locked the first admin of a new site out of their own site.
 *  - It persists. It comes back on every page load until it is acted on (the
 *    source stops emitting it, because the thing it recommended is now true) or
 *    explicitly dismissed (a row this person owns, so the answer follows them
 *    across browsers and devices rather than living in one localStorage).
 *
 * The mechanism is generic on purpose — a plugin with an update waiting, a
 * certificate about to expire, a backup that has not run — but only one source
 * exists today, and building the other ones before they are asked for is the
 * abstraction-without-three-uses the project's rules forbid. What is designed
 * in advance is the *seam*: a new recommendation is one `NoticeSource` added to
 * an array, with no change to the router, the store or the admin.
 */

export type NoticeSeverity = 'info' | 'success' | 'warning' | 'danger'

export interface AdminNotice {
  /**
   * What dismissal is recorded against. Stable across page loads and across
   * sessions — a notice about one specific thing (a plugin, a certificate)
   * qualifies it, e.g. `plugin.update-available:acme-seo`, so dismissing one
   * does not silence the rest.
   */
  readonly id: string
  /**
   * What this notice is *about*. The admin resolves it to a translated string
   * (ADR-0019): the server sends a stable code and its substitutions, never
   * prose in one language that the other half of the interface is not in.
   */
  readonly code: string
  readonly severity: NoticeSeverity
  /** Substitutions for the translated string. Values only — never a sentence. */
  readonly params?: Readonly<Record<string, string>>
  /** `false` for a notice that must stay until the thing it names is actually fixed. */
  readonly dismissible: boolean
  /** Where to go to act on it. `href` is a route inside the admin, not an absolute URL. */
  readonly action?: {
    readonly code: string
    readonly href: string
  }
}

export interface NoticeContext {
  readonly actor: Actor
}

export interface NoticeSource {
  /** Stable name, for telling two sources apart in a log or a test. */
  readonly name: string
  /**
   * The notices this source has for this actor right now, recomputed on every
   * call. A source holds no state of its own: "has this been fixed yet" is a
   * question it answers by looking, which is what makes acting on a notice make
   * it disappear without anything having to remember that it did.
   */
  list(context: NoticeContext): Promise<readonly AdminNotice[]>
}
