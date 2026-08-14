import type { JSX } from 'react'
import type { SchemaField } from '../schema/types.js'
import { BlocksField } from './blocks-field.js'
import { BooleanField } from './boolean-field.js'
import { ColorField } from './color-field.js'
import { DateField } from './date-field.js'
import { DatetimeField } from './datetime-field.js'
import { GeoField } from './geo-field.js'
import { JsonField } from './json-field.js'
import { MediaField } from './media-field.js'
import { NumberField } from './number-field.js'
import { RelationField } from './relation-field.js'
import { RichTextField } from './rich-text-field.js'
import { SelectField } from './select-field.js'
import { SlugField } from './slug-field.js'
import { TextField } from './text-field.js'

export interface FieldInputProps {
  readonly id: string
  readonly field: SchemaField
  readonly value: unknown
  onChange(value: unknown): void
  readonly disabled?: boolean
}

/**
 * One component per field kind (L2 task 5) behind a single dispatcher — a
 * new type of content in the schema means a new `case` here, never a change
 * to whatever renders a collection's form around it.
 */
export function FieldInput(props: FieldInputProps): JSX.Element {
  switch (props.field.kind) {
    case 'text':
      return <TextField {...props} value={props.value as string} />
    case 'slug':
      return <SlugField {...props} value={props.value as string} />
    case 'number':
      return <NumberField {...props} value={props.value as number | null} />
    case 'boolean':
      return <BooleanField {...props} value={props.value as boolean} />
    case 'date':
      return <DateField {...props} value={props.value as string} />
    case 'datetime':
      return <DatetimeField {...props} value={props.value as string} />
    case 'select':
      return <SelectField {...props} value={props.value as string} />
    case 'color':
      return <ColorField {...props} value={props.value as string} />
    case 'geo':
      return <GeoField {...props} value={props.value as { lat: number; lng: number } | null} />
    case 'json':
      return <JsonField {...props} />
    case 'richText':
      return <RichTextField {...props} />
    case 'media':
      return <MediaField {...props} />
    case 'relation':
      return <RelationField {...props} />
    case 'blocks':
      return <BlocksField {...props} />
  }
}
