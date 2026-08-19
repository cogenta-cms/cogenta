import { type JSX, useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentBlock } from '../api/content-client.js'
import { BlockForm } from '../blocks/block-form.js'
import { BLOCK_VOCABULARY, blockDefinition, freshBlockKey } from '../blocks/vocabulary.js'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * An ordered list of blocks, added from the vocabulary, each editing its own
 * typed fields inline — never a free-form drag-and-drop grid, since layout
 * belongs to the theme, not the content (L2-admin.md, "Éditeur de blocs").
 * Reordering is therefore two buttons, not drag-and-drop: it stays fully
 * keyboard-operable for free, which drag-and-drop would otherwise have to earn.
 */
export function BlocksField({
  id,
  field,
  value,
  onChange,
  disabled = false,
  error,
}: FieldProps<readonly ContentBlock[] | undefined>): JSX.Element {
  const { t } = useTranslation()
  const blocks = value ?? []
  const pickerId = useId()

  function updateAt(index: number, next: ContentBlock): void {
    onChange(blocks.map((block, i) => (i === index ? next : block)))
  }

  function removeAt(index: number): void {
    onChange(blocks.filter((_, i) => i !== index))
  }

  function moveBy(index: number, delta: number): void {
    const target = index + delta
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]
    const [moved] = next.splice(index, 1)
    if (moved === undefined) return
    next.splice(target, 0, moved)
    onChange(next)
  }

  function addBlock(type: string): void {
    const definition = blockDefinition(type)
    if (definition === undefined) return
    onChange([...blocks, { key: freshBlockKey(), type, data: {} }])
  }

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      <ol className="blocks-field" aria-label={field.admin?.label ?? field.name}>
        {blocks.map((block, index) => {
          const definition = blockDefinition(block.type)
          const itemId = `${id}-${block.key}`
          return (
            <li key={block.key} className="blocks-field__item">
              <div className="blocks-field__item-header">
                <span>
                  {definition?.label ?? t('fields.blocksUnknownLabel', { type: block.type })}
                </span>
                <div className="blocks-field__item-controls">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    aria-label={t('fields.blocksMoveUp', { position: index + 1 })}
                    onClick={() => moveBy(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === blocks.length - 1}
                    aria-label={t('fields.blocksMoveDown', { position: index + 1 })}
                    onClick={() => moveBy(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={t('fields.blocksRemove', { position: index + 1 })}
                    onClick={() => removeAt(index)}
                  >
                    {t('fields.mediaRemove')}
                  </button>
                </div>
              </div>

              {definition === undefined ? (
                <p role="alert">{t('fields.blocksUnrecognized', { type: block.type })}</p>
              ) : (
                <BlockForm
                  idPrefix={itemId}
                  definition={definition}
                  data={block.data}
                  disabled={disabled}
                  onChange={(data) => updateAt(index, { ...block, data })}
                />
              )}
            </li>
          )
        })}
      </ol>

      {!disabled && (
        <div className="blocks-field__add">
          <label htmlFor={pickerId}>{t('fields.blocksAddLabel')}</label>
          <select
            id={pickerId}
            value=""
            onChange={(event) => {
              if (event.target.value !== '') addBlock(event.target.value)
            }}
          >
            <option value="" disabled>
              —
            </option>
            {BLOCK_VOCABULARY.map((definition) => (
              <option key={definition.name} value={definition.name}>
                {definition.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </FieldWrapper>
  )
}
