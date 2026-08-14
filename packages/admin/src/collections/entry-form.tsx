import type { JSX } from 'react'
import type { BlockZones } from '../api/content-client.js'
import { defaultValueFor } from '../fields/default-value.js'
import { FieldInput } from '../fields/field-input.js'
import type { CollectionSummary } from '../schema/types.js'

/**
 * L2 task 7: one `FieldInput` per declared field, generated from
 * `schema.json` — adding a field to the schema needs no admin change at
 * all, which is the lot's own acceptance criterion.
 *
 * A `blocks`-kind field reads and writes its own zone rather than `values`:
 * the REST wire shape keeps block zones at `entry.blocks[fieldName]`,
 * separate from `entry.values` (`packages/api/src/content/serialise.ts`).
 */
export function EntryForm({
  collection,
  values,
  blocks,
  onChange,
  onBlocksChange,
  disabled = false,
}: {
  readonly collection: CollectionSummary
  readonly values: Readonly<Record<string, unknown>>
  readonly blocks: BlockZones
  onChange(name: string, value: unknown): void
  onBlocksChange(zone: string, value: unknown): void
  readonly disabled?: boolean
}): JSX.Element {
  return (
    <>
      {collection.fields.map((field) =>
        field.kind === 'blocks' ? (
          <FieldInput
            key={field.name}
            id={`field-${field.name}`}
            field={field}
            value={blocks[field.name] ?? []}
            onChange={(value) => onBlocksChange(field.name, value)}
            disabled={disabled}
          />
        ) : (
          <FieldInput
            key={field.name}
            id={`field-${field.name}`}
            field={field}
            value={values[field.name] ?? field.default ?? defaultValueFor(field.kind)}
            onChange={(value) => onChange(field.name, value)}
            disabled={disabled}
          />
        ),
      )}
    </>
  )
}
