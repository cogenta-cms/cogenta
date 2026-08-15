import { CogentaError } from '@cogenta/core'
import type { ContentStore } from './store.js'
import type { ContentValues } from './types.js'

/**
 * "Commencer par une démo en lecture seule" (L9 tâche 12, playground). Wraps
 * any `ContentStore` so every mutating method refuses instead of writing —
 * `create`/`duplicate`/`update`/`delete`/`untrash`/`purge`/`purgeExpired`/
 * `publish`/`unpublish`/`restore` — while every read (`read`/`list`/`history`/
 * `readVersion`/`diff`/`translations`/`resolveLocale`) passes straight
 * through, unchanged.
 *
 * The three trash methods are refused for the reason `delete` always was, and
 * `purge` most of all: a read-only demo that let a visitor empty the trash
 * would destroy content irrecoverably, which is worse than the write it was
 * meant to prevent (ADR-0022).
 *
 * A single wrap at the store level protects every consumer built on top of
 * it — REST's `ContentService` and GraphQL's gateway both construct their
 * stores from the same `storeFor` closure in `serve.ts`, so wrapping there
 * covers both transports with one guard, not two.
 */
export function withReadOnlyStore<TValues extends ContentValues = ContentValues>(
  store: ContentStore<TValues>,
): ContentStore<TValues> {
  // `async` so a synchronous refusal still surfaces as a rejected promise —
  // every `ContentStore` method is `Promise`-returning, and a caller that
  // awaits it (every real caller does) must see a rejection, not a thrown
  // exception at the call site.
  async function refuse(): Promise<never> {
    throw new CogentaError({
      code: 'CONTENT_READ_ONLY',
      message: 'This instance is read-only; the requested change was not saved.',
      hint: 'This is a read-only demo instance (e.g. a playground). Reads work normally; writes are refused, not silently dropped.',
    })
  }

  return {
    ...store,
    create: () => refuse(),
    duplicate: () => refuse(),
    update: () => refuse(),
    delete: () => refuse(),
    untrash: () => refuse(),
    purge: () => refuse(),
    purgeExpired: () => refuse(),
    publish: () => refuse(),
    unpublish: () => refuse(),
    restore: () => refuse(),
  }
}
