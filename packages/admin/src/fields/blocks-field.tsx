import { type JSX, useId } from 'react'
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
}: FieldProps<readonly ContentBlock[] | undefined>): JSX.Element {
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
    <FieldWrapper id={id} field={field}>
      <ol className="blocks-field" aria-label={field.admin?.label ?? field.name}>
        {blocks.map((block, index) => {
          const definition = blockDefinition(block.type)
          const itemId = `${id}-${block.key}`
          return (
            <li key={block.key} className="blocks-field__item">
              <div className="blocks-field__item-header">
                <span>{definition?.label ?? `Bloc inconnu : ${block.type}`}</span>
                <div className="blocks-field__item-controls">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    aria-label={`Monter le bloc ${index + 1}`}
                    onClick={() => moveBy(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === blocks.length - 1}
                    aria-label={`Descendre le bloc ${index + 1}`}
                    onClick={() => moveBy(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Retirer le bloc ${index + 1}`}
                    onClick={() => removeAt(index)}
                  >
                    Retirer
                  </button>
                </div>
              </div>

              {definition === undefined ? (
                <p role="alert">
                  Ce type de bloc (« {block.type} ») n'est pas reconnu par cet admin — ses données
                  sont conservées mais ne peuvent pas être éditées ici.
                </p>
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
          <label htmlFor={pickerId}>Ajouter un bloc</label>
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
