/**
 * The empty values a form leaves behind in a block, removed (L36 audit).
 *
 * An editor clears a field and the admin writes what an empty control holds:
 * `null` for a media or a link, `''` for a text or a select, `{}` for a
 * structured value. Contract B says "absent" for all of them — an optional
 * field is left out, never set to an empty value — and every theme reads it
 * that way (`block.media === undefined`). Stored as sent, a hero whose image
 * was removed, or a feature card with no link, crashed the public page.
 *
 * Removed at every level of the block's own data and inside list items, but
 * **never inside a node that carries a `_type`**: that is a rich-text node
 * (a paragraph, a span, a mark definition), whose empty text is meaningful.
 * Arrays are kept as they are, empty or not: a list's own rules decide
 * whether an empty list is allowed.
 */
export function pruneEmptyBlockData(
  data: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const pruned = pruneObject(data)
  return pruned ?? {}
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pruneValue(value: unknown): unknown {
  if (value === null || value === '') return undefined
  if (Array.isArray(value))
    return value.map((item) => (isPlainObject(item) ? pruneItem(item) : item))
  if (isPlainObject(value)) {
    if (typeof value['_type'] === 'string') return value
    return pruneObject(value)
  }
  return value
}

/** An item of a list is kept even when every one of its fields is empty: removing it would shift the others. */
function pruneItem(item: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  if (typeof item['_type'] === 'string') return item
  return pruneObject(item) ?? {}
}

function pruneObject(
  value: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    const next = pruneValue(inner)
    if (next !== undefined) out[key] = next
  }
  return Object.keys(out).length === 0 ? undefined : out
}
