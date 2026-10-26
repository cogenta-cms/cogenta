import { useEffect, useState } from 'react'
import { getEntry } from '../api/content-client.js'
import { useSchema } from '../schema/schema-context.js'
import { titleOf } from './entry-title.js'

export interface EntryRef {
  readonly collection: string
  readonly id: string
}

export function entryRefKey(ref: EntryRef): string {
  return `${ref.collection}/${ref.id}`
}

/**
 * The editor's own name for each entry a list points at ("Pourquoi nous
 * mesurons…" rather than `post/01a15de9-…`), looked up once per distinct
 * entry. An entry that cannot be read (deleted, or closed to this account)
 * simply has no title in the result: the caller shows its fallback.
 */
export function useEntryTitles(
  token: string | null,
  refs: readonly EntryRef[],
): ReadonlyMap<string, string> {
  const schema = useSchema()
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map())
  const wanted = [...new Set(refs.map(entryRefKey))].sort().join('|')
  const ready = schema.status === 'ready'

  // biome-ignore lint/correctness/useExhaustiveDependencies: `wanted` is the serialised form of `refs`, and `schema` only matters once it is ready.
  useEffect(() => {
    if (token === null || !ready || schema.status !== 'ready' || wanted === '') return
    let cancelled = false
    const missing = wanted.split('|').filter((key) => !titles.has(key))
    if (missing.length === 0) return
    void Promise.all(
      missing.map(async (key): Promise<readonly [string, string] | null> => {
        const slash = key.indexOf('/')
        const collection = key.slice(0, slash)
        const id = key.slice(slash + 1)
        try {
          const entry = await getEntry(token, collection, id, { trashed: 'include' })
          const definition = schema.schema.collections.find(
            (candidate) => candidate.name === collection,
          )
          const title = titleOf(entry, definition)
          return title === entry.id ? null : [key, title]
        } catch {
          return null
        }
      }),
    ).then((found) => {
      if (cancelled) return
      setTitles((current) => {
        const next = new Map(current)
        for (const pair of found) if (pair !== null) next.set(pair[0], pair[1])
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [token, ready, wanted])

  return titles
}
