import type { JSX } from 'react'
import { defaultValueFor } from '../fields/default-value.js'
import { FieldInput } from '../fields/field-input.js'
import type { CollectionSummary } from '../schema/types.js'

/**
 * L2 task 7: one `FieldInput` per declared field, generated from
 * `schema.json` — adding a field to the schema needs no admin change at
 * all, which is the lot's own acceptance criterion.
 */
export function EntryForm({
  collection,
  values,
  onChange,
  disabled = false,
}: {
  readonly collection: CollectionSummary
  readonly values: Readonly<Record<string, unknown>>
  onChange(name: string, value: unknown): void
  readonly disabled?: boolean
}): JSX.Element {
  return (
    <>
      {collection.fields.map((field) => (
        <FieldInput
          key={field.name}
          id={`field-${field.name}`}
          field={field}
          value={values[field.name] ?? field.default ?? defaultValueFor(field.kind)}
          onChange={(value) => onChange(field.name, value)}
          disabled={disabled}
        />
      ))}
    </>
  )
}
