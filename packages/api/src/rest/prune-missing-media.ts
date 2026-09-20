import { type BlockRegistry, vocabularyRegistry } from '@cogenta/blocks'
import type { BlockZones } from '@cogenta/schema'
import type { SerialisedEntry } from '../content/index.js'
import type { DependencySource } from './dependencies.js'

/**
 * Entries with every dead media reference taken out of them.
 *
 * Media can be deleted while a published page still points at it, and the page
 * then has to render anyway. The renderer cannot be the place that decides
 * this: contract D's `RenderContext.image(media): ImageSource` is frozen and
 * `ImageSource` has no "absent" state, so a theme handed an identifier nothing
 * resolves can only throw — and `renderPage` draws a whole page in one call,
 * so one dead reference took the entire document down with it (HTTP 500, for
 * every visitor, until someone edited the page).
 *
 * Widening that contract, or making `@cogenta/theme-kit`'s `image()` nullable,
 * is a breaking change to ten installed themes for a case they *already* draw:
 * "no media chosen". `entryImage` returns `ImageSource | undefined` for exactly
 * that, and the themes mark it `data-media="none"`. So the reference is removed
 * upstream instead, in the data, and a dead one becomes indistinguishable from
 * a field nobody filled in.
 *
 * The walk is deliberately the same one `collectDependencies` performs — what
 * is pruned here has to be what was loaded there, or the renderer is handed a
 * reference nothing ever checked. Read that module first: its comments explain
 * why block item media is followed structurally (by property name, inside a
 * known block's field) rather than by block type.
 */
export interface MediaPruneResult {
  /** The same entries, in the same order; an untouched one comes back by identity. */
  readonly entries: readonly SerialisedEntry[]
  /** Identifiers that were referenced and no longer resolve, sorted. */
  readonly prunedMedia: readonly string[]
  /** How many placed blocks lost their reason to exist along with their media. */
  readonly droppedBlocks: number
}

/**
 * Depth of the structural walk into a block's list fields.
 *
 * The bound `collectDependencies` uses, for the same reason, over the same two
 * property names: a block, then its items.
 */
const MAX_ITEM_DEPTH = 2

const ITEM_MEDIA_KEYS = ['media', 'avatar'] as const

/**
 * Removes every reference to media outside `available` from `entries`.
 *
 * Never writes on what it is given: an entry that changed comes back as a copy,
 * an entry that did not comes back as itself. `available` is what a render
 * actually loaded, not what it asked for — the difference between those two
 * sets is exactly what has to disappear before rendering starts.
 */
export function pruneMissingMedia(
  entries: readonly SerialisedEntry[],
  source: DependencySource,
  available: ReadonlySet<string>,
): MediaPruneResult {
  const registry = source.blocks ?? vocabularyRegistry
  const report: Report = { media: new Set<string>(), droppedBlocks: 0 }
  const pruned = entries.map((entry) => pruneEntry(entry, source, registry, available, report))

  return {
    entries: pruned,
    prunedMedia: [...report.media].sort(),
    droppedBlocks: report.droppedBlocks,
  }
}

interface Report {
  readonly media: Set<string>
  droppedBlocks: number
}

/**
 * "This value is exactly what it was."
 *
 * A plain `undefined` cannot say it: removing a reference *produces*
 * `undefined`, and the caller has to tell "nothing changed" from "the field is
 * now empty" to know whether a required field just lost its content.
 */
const UNCHANGED = Symbol('unchanged')
type Unchanged = typeof UNCHANGED

/** An item that has nothing left to show once its media is gone. */
const DROP = Symbol('drop')
type Drop = typeof DROP

/** A new value for a field, wrapped so `undefined` can mean "removed". */
interface Replaced {
  readonly value: unknown
}

type Outcome = Replaced | Unchanged

function pruneEntry(
  entry: SerialisedEntry,
  source: DependencySource,
  registry: BlockRegistry,
  available: ReadonlySet<string>,
  report: Report,
): SerialisedEntry {
  const values = pruneValues(entry, source, registry, available, report)
  const blocks = pruneZones(entry.blocks, registry, available, report)
  if (values === entry.values && blocks === entry.blocks) return entry
  return { ...entry, values, blocks }
}

function pruneValues(
  entry: SerialisedEntry,
  source: DependencySource,
  registry: BlockRegistry,
  available: ReadonlySet<string>,
  report: Report,
): SerialisedEntry['values'] {
  const definition = source.collection(entry.collection)
  if (definition === undefined) return entry.values

  let values = entry.values
  for (const [name, field] of Object.entries(definition.fields)) {
    const value = values[name]

    // A collection field losing its picture never removes the entry: an
    // article without its cover is still an article. Only a block can lose
    // its whole reason to exist (see `pruneBlock`).
    if (field.kind === 'media') {
      const outcome = pruneReference(value, available, report)
      if (outcome !== UNCHANGED) values = assign(values, name, outcome.value)
      continue
    }

    // A collection whose body is `richText` rather than a block zone is
    // rendered as one synthetic `prose` block (`toVocabularyBlocks`), so its
    // media nodes reach `ctx.image()` just like a block's own would.
    if (field.kind === 'richText') {
      const outcome = pruneRichText(value, available, report)
      if (outcome !== UNCHANGED) values = assign(values, name, outcome.value)
      continue
    }

    // An expanded relation is another entry's wire shape inlined into this
    // one — the same recursion `collectDependencies` does, for the same
    // reason: the media it names is media this payload carries. Expansion is
    // depth-bounded, so the payload is a finite tree and needs no visit guard
    // to terminate; an entry appearing twice is simply pruned twice.
    if (field.kind === 'relation') {
      const outcome = pruneRelation(value, source, registry, available, report)
      if (outcome !== UNCHANGED) values = assign(values, name, outcome.value)
    }
  }
  return values
}

function pruneRelation(
  value: unknown,
  source: DependencySource,
  registry: BlockRegistry,
  available: ReadonlySet<string>,
  report: Report,
): Outcome {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item: unknown) => {
      const outcome = pruneRelation(item, source, registry, available, report)
      if (outcome === UNCHANGED) return item
      changed = true
      return outcome.value
    })
    return changed ? { value: next } : UNCHANGED
  }
  if (!isSerialised(value)) return UNCHANGED
  const pruned = pruneEntry(value, source, registry, available, report)
  return pruned === value ? UNCHANGED : { value: pruned }
}

/** An expanded relation is an object with the wire shape; an identifier is a string. */
function isSerialised(value: unknown): value is SerialisedEntry {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; collection?: unknown }
  return typeof candidate.id === 'string' && typeof candidate.collection === 'string'
}

function pruneZones(
  zones: BlockZones,
  registry: BlockRegistry,
  available: ReadonlySet<string>,
  report: Report,
): BlockZones {
  let changed = false
  const next: Record<string, readonly PlacedBlock[]> = {}

  for (const [zone, blocks] of Object.entries(zones)) {
    const kept: PlacedBlock[] = []
    let zoneChanged = false
    for (const block of blocks) {
      const outcome = pruneBlock(block, registry, available, report)
      if (outcome === null) {
        report.droppedBlocks += 1
        zoneChanged = true
        continue
      }
      if (outcome !== block) zoneChanged = true
      kept.push(outcome)
    }
    next[zone] = zoneChanged ? kept : blocks
    changed ||= zoneChanged
  }

  return changed ? next : zones
}

type PlacedBlock = BlockZones[string][number]

/** The block with its dead media gone, or `null` when nothing of it is left to draw. */
function pruneBlock(
  block: PlacedBlock,
  registry: BlockRegistry,
  available: ReadonlySet<string>,
  report: Report,
): PlacedBlock | null {
  const definition = registry.get(block.type)
  // A block type this registry does not know — one a removed plugin left
  // behind — contributes nothing and loses nothing, the same answer
  // `collectDependencies` gives it: its media was never loaded either, so it
  // was never a candidate here, and guessing at its shape would be a second,
  // undeclared vocabulary.
  if (definition === undefined) return block

  let data = block.data
  let empty = false

  for (const [name, field] of Object.entries(definition.schema)) {
    const value = data[name]

    if (field.kind === 'media') {
      const outcome = pruneReference(value, available, report)
      if (outcome === UNCHANGED) continue
      data = assign(data, name, outcome.value)
      if (field.required && isEmptyReference(outcome.value)) empty = true
      continue
    }

    if (field.kind === 'richText') {
      const outcome = pruneRichText(value, available, report)
      if (outcome !== UNCHANGED) data = assign(data, name, outcome.value)
      continue
    }

    // A list field carries raw item objects, whose shapes are plain zod
    // schemas with no declared kind to read — so the media inside them is
    // followed by property name, structurally, exactly as
    // `collectDependencies` does, and only inside a known block's field.
    if (field.kind === 'json' || Array.isArray(value)) {
      const outcome = pruneItems(value, available, report, MAX_ITEM_DEPTH)
      if (outcome === UNCHANGED) continue
      data = assign(data, name, outcome.value)
      const next = outcome.value
      if (field.required && Array.isArray(next) && next.length === 0) empty = true
    }
  }

  if (empty) return null
  return data === block.data ? block : { ...block, data }
}

function assign(
  values: Readonly<Record<string, unknown>>,
  name: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  const next = { ...values }
  // Removed rather than set to `undefined`: "no media chosen" is a field that
  // is not there, which is the shape every reader downstream already handles
  // (`pruneEmptyBlockData`, `entryImage`).
  if (value === undefined) delete next[name]
  else next[name] = value
  return next
}

/** A media field's value: one identifier, or several. */
function pruneReference(value: unknown, available: ReadonlySet<string>, report: Report): Outcome {
  if (typeof value === 'string' && value.length > 0) {
    if (available.has(value)) return UNCHANGED
    report.media.add(value)
    return { value: undefined }
  }
  if (!Array.isArray(value)) return UNCHANGED

  let changed = false
  const kept: unknown[] = []
  for (const item of value as readonly unknown[]) {
    if (typeof item === 'string' && item.length > 0 && !available.has(item)) {
      report.media.add(item)
      changed = true
      continue
    }
    kept.push(item)
  }
  return changed ? { value: kept } : UNCHANGED
}

function isEmptyReference(value: unknown): boolean {
  if (value === undefined) return true
  return Array.isArray(value) && value.length === 0
}

/**
 * The media inside a block's list field.
 *
 * An array is a list of items: an item whose picture is gone leaves the list,
 * and the ones beside it stay — a gallery that lost one photograph is still a
 * gallery. An object is *not* an item of anything (`testimonial`'s grouped
 * `attribution`, `blocks@2.0` RFC 0001), so its dead key is removed while the
 * object itself stays: dropping it whole would lose the quote because the
 * portrait went missing.
 */
function pruneItems(
  value: unknown,
  available: ReadonlySet<string>,
  report: Report,
  depth: number,
): Outcome {
  if (depth <= 0) return UNCHANGED

  if (Array.isArray(value)) {
    let changed = false
    const kept: unknown[] = []
    for (const item of value as readonly unknown[]) {
      const outcome = pruneItem(item, available, report, depth - 1)
      if (outcome === DROP) {
        changed = true
        continue
      }
      if (outcome === UNCHANGED) {
        kept.push(item)
        continue
      }
      changed = true
      kept.push(outcome.value)
    }
    return changed ? { value: kept } : UNCHANGED
  }

  return withoutDeadKeys(value, available, report)
}

function pruneItem(
  item: unknown,
  available: ReadonlySet<string>,
  report: Report,
  depth: number,
): Outcome | Drop {
  // An array nested inside a list item is as deep as `collectDependencies`
  // goes, and it reads nothing there.
  if (depth <= 0 || Array.isArray(item)) return UNCHANGED
  if (typeof item !== 'object' || item === null) return UNCHANGED

  const record = item as Readonly<Record<string, unknown>>
  let next: Readonly<Record<string, unknown>> | undefined
  for (const key of ITEM_MEDIA_KEYS) {
    const outcome = pruneReference(record[key], available, report)
    if (outcome === UNCHANGED) continue
    // The item exists to show that media. Nothing of it survives the media
    // going away, so it leaves the list rather than rendering as a hole.
    if (isEmptyReference(outcome.value)) return DROP
    next = assign(next ?? record, key, outcome.value)
  }
  return next === undefined ? UNCHANGED : { value: next }
}

/** `pruneItem`'s rule for an object that is a field's whole value, not an item of a list. */
function withoutDeadKeys(value: unknown, available: ReadonlySet<string>, report: Report): Outcome {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return UNCHANGED

  const record = value as Readonly<Record<string, unknown>>
  let next: Readonly<Record<string, unknown>> | undefined
  for (const key of ITEM_MEDIA_KEYS) {
    const outcome = pruneReference(record[key], available, report)
    if (outcome === UNCHANGED) continue
    next = assign(next ?? record, key, outcome.value)
  }
  return next === undefined ? UNCHANGED : { value: next }
}

/**
 * The `media` nodes of a rich text document (ADR-0013).
 *
 * `collectDependencies` does not reach in here — the host merges rich text's
 * own identifiers in separately (`collectRichTextAssets`) — but what this
 * module upholds is a property of `ctx.image()`, not of that walk: a `media`
 * node whose asset is gone reaches `renderRichText`, which calls `image()` on
 * it, and the page is a 500 again. So the node goes. The text around it is
 * untouched.
 */
function pruneRichText(value: unknown, available: ReadonlySet<string>, report: Report): Outcome {
  if (!Array.isArray(value)) return UNCHANGED

  let changed = false
  const kept: unknown[] = []
  for (const node of value as readonly unknown[]) {
    if (typeof node === 'object' && node !== null) {
      const record = node as { _type?: unknown; id?: unknown }
      if (
        record._type === 'media' &&
        typeof record.id === 'string' &&
        record.id.length > 0 &&
        !available.has(record.id)
      ) {
        report.media.add(record.id)
        changed = true
        continue
      }
    }
    kept.push(node)
  }
  return changed ? { value: kept } : UNCHANGED
}
