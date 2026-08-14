import type { JSX } from 'react'
import { defaultValueFor } from '../fields/default-value.js'
import { FieldInput } from '../fields/field-input.js'
import type { BlockDefinition } from './vocabulary.js'

/**
 * One placed block's own typed fields, generated from its vocabulary entry —
 * the same "schema in, form out" shape as `EntryForm` (task 7), so a block
 * added to the vocabulary needs no bespoke editor (ADR-0009: "l'admin est
 * généré depuis le schéma").
 */
export function BlockForm({
  idPrefix,
  definition,
  data,
  onChange,
  disabled = false,
}: {
  readonly idPrefix: string
  readonly definition: BlockDefinition
  readonly data: Readonly<Record<string, unknown>>
  onChange(data: Readonly<Record<string, unknown>>): void
  readonly disabled?: boolean
}): JSX.Element {
  return (
    <>
      {definition.fields.map((field) => (
        <FieldInput
          key={field.name}
          id={`${idPrefix}-${field.name}`}
          field={field}
          value={data[field.name] ?? defaultValueFor(field.kind)}
          onChange={(value) => onChange({ ...data, [field.name]: value })}
          disabled={disabled}
        />
      ))}
    </>
  )
}
