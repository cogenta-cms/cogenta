import type { JSX } from 'react'
import type { RichTextDocument } from '../rich-text/portable-text.js'
import { RichTextEditor } from '../rich-text/rich-text-editor.js'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

const EMPTY: RichTextDocument = []

export function RichTextField({
  id,
  field,
  value,
  onChange,
  disabled,
}: FieldProps<RichTextDocument | undefined>): JSX.Element {
  return (
    <FieldWrapper id={id} field={field}>
      <RichTextEditor id={id} value={value ?? EMPTY} disabled={disabled} onChange={onChange} />
    </FieldWrapper>
  )
}
