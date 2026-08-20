import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'

/**
 * Field correspondence, fiche 25 task 2.
 *
 * `null` on a source field means "ignore" — the preview names it, the
 * mapping screen offers it, and the report counts it under
 * `fieldsWithoutTarget` so an import never drops data silently.
 */
export interface FieldMapping {
  readonly targetCollection: string
  /** Source field name → target field name, or `null` to ignore it. */
  readonly fields: Readonly<Record<string, string | null>>
}

export interface ResolvedMapping {
  readonly collection: CollectionDefinition
  /** Source field → target field, `null` entries already removed. */
  readonly fields: ReadonlyMap<string, string>
  readonly ignored: readonly string[]
}

/** Proposes target field names by matching source header names case-insensitively (task 2's "correspondances proposées automatiquement"). */
export function proposeFieldMapping(
  sourceFields: readonly string[],
  collection: CollectionDefinition,
): FieldMapping {
  const targetNames = new Map(
    Object.keys(collection.fields).map((name) => [name.toLowerCase(), name] as const),
  )
  const fields: Record<string, string | null> = {}
  for (const source of sourceFields) {
    fields[source] = targetNames.get(source.toLowerCase()) ?? null
  }
  return { targetCollection: collection.name, fields }
}

export function resolveMapping(
  mapping: FieldMapping,
  collections: readonly CollectionDefinition[],
): ResolvedMapping {
  const collection = collections.find((c) => c.name === mapping.targetCollection)
  if (collection === undefined) {
    throw new CogentaError({
      code: 'IMPORT_MAPPING_INVALID',
      message: `Collection "${mapping.targetCollection}" does not exist on this site.`,
      hint: 'Pick a collection this site declares, or use the field-mapping screen to change the target.',
      details: { collection: mapping.targetCollection },
    })
  }

  const targetFieldNames = new Set(Object.keys(collection.fields))
  const fields = new Map<string, string>()
  const ignored: string[] = []

  for (const [source, target] of Object.entries(mapping.fields)) {
    if (target === null) {
      ignored.push(source)
      continue
    }
    if (!targetFieldNames.has(target)) {
      throw new CogentaError({
        code: 'IMPORT_MAPPING_INVALID',
        message: `Collection "${collection.name}" has no field "${target}".`,
        hint: 'Point this source column at an existing field, or map it to "ignore".',
        details: { collection: collection.name, field: target },
      })
    }
    fields.set(source, target)
  }

  return { collection, fields, ignored }
}
