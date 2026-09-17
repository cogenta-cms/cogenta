import type { JSX } from 'react'
import type { ItemFieldDefinition } from '../blocks/vocabulary.js'
import { defaultValueFor } from './default-value.js'
import { FieldInput } from './field-input.js'
import { LinkTargetField, type LinkTargetValue } from './link-target-field.js'

/**
 * One field of a structured value — an item of a repeater, or the members of
 * an object such as a testimonial's attribution (L36 audit). Shared so a link,
 * a media or a select behaves the same wherever it is nested.
 */
export function ItemFieldInput({
  id,
  itemField,
  value,
  onChange,
  disabled = false,
}: {
  readonly id: string
  readonly itemField: ItemFieldDefinition
  readonly value: unknown
  onChange(value: unknown): void
  readonly disabled?: boolean
}): JSX.Element {
  if (itemField.kind === 'link') {
    return (
      <LinkTargetField
        id={id}
        label={itemField.admin?.label ?? itemField.name}
        required={itemField.required}
        value={value as LinkTargetValue}
        onChange={onChange}
        disabled={disabled}
      />
    )
  }
  return (
    <FieldInput
      id={id}
      field={{
        name: itemField.name,
        kind: itemField.kind,
        required: itemField.required,
        localized: itemField.localized,
        unique: false,
        hasCustomValidation: false,
        options: itemField.options,
        ...(itemField.admin === undefined ? {} : { admin: itemField.admin }),
      }}
      value={value ?? defaultValueFor(itemField.kind)}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
