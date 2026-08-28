import { extractLinks, queryTokens, titleOf } from '@cogenta/schema'
import type { SeoResource } from './types.js'

/**
 * Internal link assistant (fiche 70, task 2) — AIOSEO's Link Assistant,
 * without the "recommandation IA" framing: this file finds **candidates**
 * from real, already-published content, never invents an anchor or writes
 * anything (R6 — a suggestion is displayed, never applied automatically; see
 * this file's own test for the orphan/candidate boundary).
 *
 * **Reuses the graph contract A already lets you build.** `extractLinks`
 * (`@cogenta/schema`) was written for the broken-link crawler (L14 task 3)
 * and already walks every shape a link can take — a rich-text `markDefs`
 * `internalLink`, a contract-B action `target`, a plain `url` field — so this
 * file adds nothing new to what counts as "a link"; it only asks a different
 * question of the same graph: not "does this lead somewhere real" but "does
 * anything lead *here*".
 *
 * **Pure, and deliberately not a crawler of its own.** `@cogenta/seo` never
 * touches a database (see this package's own `index.ts` module comment,
 * rule R5) — the caller (`createSeoRouter`'s new `GET
 * /api/seo/link-suggestions` route) does the actual reading through the
 * permission-checked gateway and hands this file the resulting resources, the
 * same shape `SeoDiagnostics` itself is built from.
 */

export interface OrphanEntry {
  readonly collection: string
  readonly id: string
  readonly title: string
}

export interface LinkSuggestion {
  readonly collection: string
  readonly id: string
  readonly title: string
  /** How many meaningful title words this candidate shares with the subject entry — a ranking signal, never a score shown as a percentage (the same "no false precision" rule `content-analysis.ts` follows). */
  readonly sharedWordCount: number
}

export interface LinkAssistantReport {
  readonly orphans: readonly OrphanEntry[]
  /** Up to five candidates per entry, keyed by `"collection/id"`. An entry with no plausible candidate is simply absent from the map. */
  readonly suggestionsByEntry: ReadonlyMap<string, readonly LinkSuggestion[]>
}

const MAX_SUGGESTIONS = 5

function keyOf(collection: string, id: string): string {
  return `${collection}/${id}`
}

/**
 * Every published, routed resource this site has (across every collection,
 * not only the one an admin is looking at) is what makes "orphan" mean
 * something real: an entry linked only from a *different* collection's page
 * — a homepage's "Latest article" block, say — must not be reported as
 * orphaned just because nothing in its own collection happens to link it.
 * The caller narrows which entries are *reported* to one collection; the
 * graph itself is never narrowed, or the answer would lie.
 */
export function analyseInternalLinks(resources: readonly SeoResource[]): LinkAssistantReport {
  const known = new Set(
    resources.map((resource) => keyOf(resource.collection.name, resource.entry.id)),
  )

  const inbound = new Set<string>()
  for (const resource of resources) {
    const from = keyOf(resource.collection.name, resource.entry.id)
    for (const link of extractLinks(resource.entry)) {
      if (link.kind !== 'entry') continue
      const target = keyOf(link.collection, link.id)
      // A page linking to itself does not un-orphan it — the question this
      // report answers is "does anything *else* lead here".
      if (target === from) continue
      if (known.has(target)) inbound.add(target)
    }
  }

  const orphans: OrphanEntry[] = []
  for (const resource of resources) {
    const key = keyOf(resource.collection.name, resource.entry.id)
    if (inbound.has(key)) continue
    orphans.push({
      collection: resource.collection.name,
      id: resource.entry.id,
      title: titleOf(resource.collection, resource.entry),
    })
  }

  const byCollection = new Map<string, SeoResource[]>()
  for (const resource of resources) {
    const list = byCollection.get(resource.collection.name)
    if (list === undefined) byCollection.set(resource.collection.name, [resource])
    else list.push(resource)
  }

  const suggestionsByEntry = new Map<string, readonly LinkSuggestion[]>()
  for (const resource of resources) {
    const subjectTitle = titleOf(resource.collection, resource.entry)
    const subjectWords = new Set(queryTokens(subjectTitle))
    if (subjectWords.size === 0) continue

    const siblings = byCollection.get(resource.collection.name) ?? []
    const candidates: LinkSuggestion[] = []
    for (const sibling of siblings) {
      if (sibling.entry.id === resource.entry.id) continue
      const siblingTitle = titleOf(sibling.collection, sibling.entry)
      const sharedWordCount = new Set(
        queryTokens(siblingTitle).filter((word) => subjectWords.has(word)),
      ).size
      if (sharedWordCount === 0) continue
      candidates.push({
        collection: sibling.collection.name,
        id: sibling.entry.id,
        title: siblingTitle,
        sharedWordCount,
      })
    }

    candidates.sort(
      (a, b) => b.sharedWordCount - a.sharedWordCount || a.title.localeCompare(b.title),
    )
    if (candidates.length > 0) {
      suggestionsByEntry.set(
        keyOf(resource.collection.name, resource.entry.id),
        candidates.slice(0, MAX_SUGGESTIONS),
      )
    }
  }

  return { orphans, suggestionsByEntry }
}
