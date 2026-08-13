import type { BlockZones, ContentBlock, ContentValues } from './types.js'

/**
 * Field-by-field and block-by-block. Never a diff of a serialisation.
 *
 * The L1 spec is blunt about why: a diff computed on the JSON text of an entry
 * is unreadable, and unreadable is the same as absent — nobody approves a change
 * they cannot see. An editor wants "the subtitle changed" and "the third block
 * moved to second", not a wall of braces.
 */

export type ChangeKind = 'added' | 'removed' | 'changed'

export interface FieldChange {
  readonly field: string
  readonly change: ChangeKind
  readonly before: unknown
  readonly after: unknown
}

export interface BlockChange {
  /** The block zone this block belongs to. */
  readonly zone: string
  /** The stable `_key` of the block; how a block is followed across versions. */
  readonly key: string
  readonly type: string
  readonly change: ChangeKind | 'moved'
  readonly fromIndex: number | null
  readonly toIndex: number | null
  /** Populated for `changed`: what changed inside the block. */
  readonly fields: readonly FieldChange[]
}

export interface ContentDiff {
  readonly fields: readonly FieldChange[]
  readonly blocks: readonly BlockChange[]
  readonly changed: boolean
}

/**
 * Structural equality, without a dependency (rule R9).
 *
 * Values here are JSON-shaped: what a field holds after decoding. Key order is
 * not significant, so `{a,b}` and `{b,a}` compare equal — a diff that reported
 * a change because the driver returned keys in another order would be noise.
 */
export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right) return false
  if (left === null || right === null) return false
  if (typeof left !== 'object' || typeof right !== 'object') return false

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    return left.every((item, index) => deepEqual(item, right[index]))
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])

  for (const key of keys) {
    if (!deepEqual(leftRecord[key], rightRecord[key])) return false
  }
  return true
}

/** Undefined and null both mean "no value"; only one of them is ever stored. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null
}

export function diffValues(before: ContentValues, after: ContentValues): FieldChange[] {
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  const changes: FieldChange[] = []

  for (const field of fields) {
    const from = before[field]
    const to = after[field]
    if (deepEqual(from, to)) continue

    const change: ChangeKind = isAbsent(from) ? 'added' : isAbsent(to) ? 'removed' : 'changed'
    changes.push({ field, change, before: from ?? null, after: to ?? null })
  }

  return changes
}

/**
 * Blocks are matched by `_key`, never by position.
 *
 * Matching by position would report an insertion at the top as "every block
 * changed". Matching by key reports one addition and a set of moves, which is
 * what actually happened.
 */
export function diffBlocks(
  zone: string,
  before: readonly ContentBlock[],
  after: readonly ContentBlock[],
): BlockChange[] {
  const beforeIndex = new Map(before.map((block, index) => [block.key, { block, index }]))
  const afterIndex = new Map(after.map((block, index) => [block.key, { block, index }]))
  const changes: BlockChange[] = []

  for (const [key, { block, index }] of beforeIndex) {
    if (afterIndex.has(key)) continue
    changes.push({
      zone,
      key,
      type: block.type,
      change: 'removed',
      fromIndex: index,
      toIndex: null,
      fields: [],
    })
  }

  for (const [key, { block, index }] of afterIndex) {
    const previous = beforeIndex.get(key)

    if (previous === undefined) {
      changes.push({
        zone,
        key,
        type: block.type,
        change: 'added',
        fromIndex: null,
        toIndex: index,
        fields: [],
      })
      continue
    }

    const fields = diffValues(previous.block.data, block.data)
    const retyped = previous.block.type !== block.type

    if (fields.length > 0 || retyped) {
      changes.push({
        zone,
        key,
        type: block.type,
        change: 'changed',
        fromIndex: previous.index,
        toIndex: index,
        fields,
      })
    } else if (previous.index !== index) {
      changes.push({
        zone,
        key,
        type: block.type,
        change: 'moved',
        fromIndex: previous.index,
        toIndex: index,
        fields: [],
      })
    }
  }

  return changes.sort(
    (left, right) =>
      (left.toIndex ?? left.fromIndex ?? 0) - (right.toIndex ?? right.fromIndex ?? 0),
  )
}

export function diffBlockZones(before: BlockZones, after: BlockZones): BlockChange[] {
  const zones = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return zones.flatMap((zone) => diffBlocks(zone, before[zone] ?? [], after[zone] ?? []))
}

export function diffContent(
  before: { readonly values: ContentValues; readonly blocks: BlockZones },
  after: { readonly values: ContentValues; readonly blocks: BlockZones },
): ContentDiff {
  const fields = diffValues(before.values, after.values)
  const blocks = diffBlockZones(before.blocks, after.blocks)
  return { fields, blocks, changed: fields.length > 0 || blocks.length > 0 }
}
