import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { plainTextOfRichText, readingTimeMinutes, wordCount } from '../collections/word-count.js'
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
  error,
}: FieldProps<RichTextDocument | undefined>): JSX.Element {
  const { t } = useTranslation()
  // Walks the portable-text document's spans (task 5's piège: `JSON.stringify`
  // would count `_key`/`_type`/`style` as words too).
  const words = wordCount(plainTextOfRichText(value))

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      <RichTextEditor id={id} value={value ?? EMPTY} disabled={disabled} onChange={onChange} />
      <p className="field__word-count">
        {t('fields.wordCount', { count: words, minutes: readingTimeMinutes(words) })}
      </p>
    </FieldWrapper>
  )
}
