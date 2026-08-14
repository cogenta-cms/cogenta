export type DiffChangeKind = 'added' | 'removed' | 'changed'

export interface DiffEntry {
  readonly path: string
  readonly kind: DiffChangeKind
  readonly before: unknown
  readonly after: unknown
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/**
 * "Diffé" — Contract C's own word for what every audited action carries.
 * Not wired into every tool automatically (this runtime has no generic way
 * to read a tool's "before" state); a caller who has both snapshots — a
 * revert, a content-edit tool that read the entry first — hands them here
 * to get the field-by-field record R6 asks for, rather than diffing a raw
 * serialisation.
 */
export function diffValues(before: unknown, after: unknown, path = ''): readonly DiffEntry[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const entries: DiffEntry[] = []
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) {
      const childPath = path === '' ? key : `${path}.${key}`
      const hasBefore = Object.hasOwn(before, key)
      const hasAfter = Object.hasOwn(after, key)
      if (!hasBefore) {
        entries.push({ path: childPath, kind: 'added', before: undefined, after: after[key] })
      } else if (!hasAfter) {
        entries.push({ path: childPath, kind: 'removed', before: before[key], after: undefined })
      } else {
        entries.push(...diffValues(before[key], after[key], childPath))
      }
    }
    return entries
  }

  if (sameValue(before, after)) return []
  return [{ path: path === '' ? '(root)' : path, kind: 'changed', before, after }]
}
