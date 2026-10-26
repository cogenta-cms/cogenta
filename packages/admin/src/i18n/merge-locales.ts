/**
 * Deep-merges extra translation trees over a base one, the extras winning.
 *
 * The shop screens keep their strings in `commerce.<lang>.json` rather than in
 * the big `<lang>.json`, so a change to one screen group never conflicts with
 * an edit to the rest of the admin. Both files land in the same `translation`
 * namespace: a key is addressed by its path alone, wherever it is stored.
 */
type Tree = { readonly [key: string]: unknown }

function isTree(value: unknown): value is Tree {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function mergeLocales(base: Tree, ...extras: readonly Tree[]): Tree {
  let merged: Tree = base
  for (const extra of extras) {
    const next: { [key: string]: unknown } = { ...merged }
    for (const [key, value] of Object.entries(extra)) {
      const current = next[key]
      next[key] = isTree(current) && isTree(value) ? mergeLocales(current, value) : value
    }
    merged = next
  }
  return merged
}
