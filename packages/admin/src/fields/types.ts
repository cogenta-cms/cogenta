import type { SchemaField } from '../schema/types.js'

/** Every field component's shape: a controlled input, nothing more. */
export interface FieldProps<TValue> {
  readonly id: string
  readonly field: SchemaField
  readonly value: TValue
  onChange(value: TValue): void
  readonly disabled?: boolean
}

export interface GeoValue {
  readonly lat: number
  readonly lng: number
}
