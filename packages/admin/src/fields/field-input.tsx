import type { JSX } from 'react'
import type { ContentBlock } from '../api/content-client.js'
import type { RichTextDocument } from '../rich-text/portable-text.js'
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
import { RepeaterField } from './repeater-field.js'
import { RichTextField } from './rich-text-field.js'
import { SelectField } from './select-field.js'
import { SlugField } from './slug-field.js'
import { TaxonomyField } from './taxonomy-field.js'
import { TextField } from './text-field.js'

export interface FieldInputProps {
  readonly id: string
  readonly field: SchemaField
  readonly value: unknown
  onChange(value: unknown): void
  readonly disabled?: boolean
  /** A client-side validation message for this field (fiche 02 task 3), or absent/null when it holds none. */
  readonly error?: string | null
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
      return <SelectField {...props} value={props.value as string | readonly string[]} />
    case 'color':
      return <ColorField {...props} value={props.value as string} />
    case 'geo':
      return <GeoField {...props} value={props.value as { lat: number; lng: number } | null} />
    case 'json':
      // A `json` field whose `options.list` marks it as an `f.list(...)`'s
      // compiled form (`packages/admin/src/blocks/vocabulary.ts`) gets the
      // repeater built from `options.items`; a genuine `json` field — the
      // top-level kind, or `collectionList`'s `filter`/`sort` — keeps the
      // textarea, which is the right editor for arbitrary JSON (task 4).
      return (props.field.options as { readonly list?: boolean }).list === true ? (
        <RepeaterField {...props} />
      ) : (
        <JsonField {...props} />
      )
    case 'richText':
      return <RichTextField {...props} value={props.value as RichTextDocument | undefined} />
    case 'media':
      return <MediaField {...props} />
    case 'relation':
      return <RelationField {...props} />
    case 'taxonomy':
      return <TaxonomyField {...props} />
    case 'blocks':
      return <BlocksField {...props} value={props.value as readonly ContentBlock[] | undefined} />
  }
}
