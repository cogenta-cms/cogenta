import type { SchemaField } from '../schema/types.js'

/** Every field component's shape: a controlled input, nothing more. */
export interface FieldProps<TValue> {
  readonly id: string
  readonly field: SchemaField
  readonly value: TValue
  onChange(value: TValue): void
  readonly disabled?: boolean
  /**
   * A client-side validation message for this field, or `null`/absent when
   * it currently holds none (fiche 02 task 3). `FieldWrapper` renders it and
   * gives it the id `aria-describedby` needs; each field component is
   * responsible for putting `aria-invalid`/`aria-describedby` on its own
   * primary control, since `FieldWrapper` never touches `children`.
   */
  readonly error?: string | null
}

export interface GeoValue {
  readonly lat: number
  readonly lng: number
}
