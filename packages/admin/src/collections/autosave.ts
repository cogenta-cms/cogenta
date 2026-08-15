import type { BlockZones } from '../api/content-client.js'

/**
 * Autosave of a draft being typed — deliberately **local to the browser**,
 * and deliberately **not** a call to `PATCH /api/content/...`.
 *
 * The reason is in the server, not here. `ContentStore.history()` returns one
 * summary per row of the versions table, and it distinguishes nothing: every
 * `update()` writes a version row, and `prune()` then keeps only the newest
 * `versioning.keep` of them (20 by default). An autosave that went through
 * `update()` would therefore not merely add noise to the history — it would
 * push real, deliberate versions out of the window an editor relies on to
 * answer "what did this look like on Tuesday". Twenty keystroke-triggered
 * saves and the last twenty *real* saves are gone.
 *
 * The conclusion the L13 spec asks us to reach ("voir comment `history()`
 * distingue déjà une sauvegarde explicite d'une autre") is that it does not
 * distinguish them at all, and that the fix is not to teach it to: it is that
 * a draft in progress must not reach the versions table until a human decides
 * it should. So an autosaved draft lives in `localStorage` until either the
 * editor saves — which clears it — or comes back to a tab that crashed and
 * recovers it.
 *
 * What that buys: a closed tab, a crashed browser, a mis-clicked "back" no
 * longer lose an afternoon of writing, and the version history stays exactly
 * as truthful as it is today.
 *
 * What it does not buy, stated rather than glossed over: the recovery is on
 * that browser, on that machine. Someone whose laptop dies gets nothing back
 * from another one. A server-side scratch buffer would fix that; it needs a
 * store, a route and a retention rule of its own, and none of that is in this
 * task's scope.
 */

/** Bumped when the stored shape changes; anything older is dropped, never migrated. */
const FORMAT = 1

const PREFIX = 'cogenta.autosave'

/** Long enough not to write on every keystroke, short enough that what is lost is a sentence. */
export const AUTOSAVE_INTERVAL_MS = 5000

export interface AutosaveSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly blocks: BlockZones
}

export interface AutosaveRecord extends AutosaveSnapshot {
  /** When this was written, ISO-8601. Compared against the entry's `updatedAt`. */
  readonly at: string
}

interface StoredRecord extends AutosaveRecord {
  readonly format: number
}

/**
 * Where an autosave is kept. `localStorage` in the browser; a test or a future
 * caller can hand in anything with the same three methods.
 */
export interface AutosaveStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * One key per (collection, entry, locale).
 *
 * The locale is part of it because an entry is per language (ADR-0014): the
 * French and the English rows are two entries, and recovering one into the
 * other would silently overwrite a translation.
 */
export function autosaveKey(collection: string, entryId: string | null, locale: string): string {
  return `${PREFIX}.${collection}.${entryId ?? 'new'}.${locale}`
}

export function readAutosave(storage: AutosaveStorage, key: string): AutosaveRecord | null {
  const raw = storage.getItem(key)
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Corrupt or hand-edited: drop it rather than crash the editor on open.
    storage.removeItem(key)
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) {
    storage.removeItem(key)
    return null
  }

  const record = parsed as Partial<StoredRecord>
  if (
    record.format !== FORMAT ||
    typeof record.at !== 'string' ||
    typeof record.values !== 'object' ||
    record.values === null ||
    typeof record.blocks !== 'object' ||
    record.blocks === null
  ) {
    storage.removeItem(key)
    return null
  }

  return { at: record.at, values: record.values, blocks: record.blocks }
}

export function writeAutosave(
  storage: AutosaveStorage,
  key: string,
  snapshot: AutosaveSnapshot,
  at: Date = new Date(),
): void {
  const record: StoredRecord = {
    format: FORMAT,
    at: at.toISOString(),
    values: snapshot.values,
    blocks: snapshot.blocks,
  }
  try {
    storage.setItem(key, JSON.stringify(record))
  } catch {
    // A full or disabled localStorage must never break typing. Losing the
    // safety net is bad; losing the edit because the safety net threw is worse.
  }
}

/**
 * `localStorage` can throw on access alone — Safari in private mode, and any
 * browser with site data blocked. Autosave is a safety net; a missing net must
 * never be an error in the editor, so this reports absence rather than failing.
 */
export function browserAutosaveStorage(): AutosaveStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function clearAutosave(storage: AutosaveStorage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Same reasoning as `writeAutosave`.
  }
}

/**
 * Whether a stored draft is worth offering back.
 *
 * Two conditions, both necessary. It has to be **newer** than what the server
 * last recorded — an autosave from before the last real save is already in the
 * entry, and offering it would invite an editor to undo their own save. And it
 * has to actually **differ** from what was loaded, so an editor who typed
 * nothing and closed the tab is not greeted by a recovery prompt for a change
 * that does not exist.
 */
export function isRecoverable(
  record: AutosaveRecord | null,
  loaded: AutosaveSnapshot,
  updatedAt: string,
): boolean {
  if (record === null) return false

  const recordedAt = Date.parse(record.at)
  const savedAt = Date.parse(updatedAt)
  if (Number.isNaN(recordedAt)) return false
  if (!Number.isNaN(savedAt) && recordedAt <= savedAt) return false

  return !sameSnapshot(record, loaded)
}

/**
 * Structural comparison through JSON.
 *
 * Every value in an entry came from JSON over the wire and goes back as JSON,
 * so there is nothing here a serialisation could lose — no `Date`, no `Map`,
 * no cycle. Key order is the one risk, and both sides are built by the same
 * code from the same server response, so it holds.
 */
export function sameSnapshot(left: AutosaveSnapshot, right: AutosaveSnapshot): boolean {
  return (
    JSON.stringify(left.values) === JSON.stringify(right.values) &&
    JSON.stringify(left.blocks) === JSON.stringify(right.blocks)
  )
}
