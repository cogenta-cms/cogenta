import { type JSX, useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { ItemFieldDefinition, ItemFieldKind } from '../blocks/vocabulary.js'
import '../styles/fields.css'
import { cn } from '../ui/cn.js'
import { Button } from '../ui/index.js'
import { defaultValueFor } from './default-value.js'
import { FieldInput } from './field-input.js'
import { LinkTargetField, type LinkTargetValue } from './link-target-field.js'
import type { FieldProps } from './types.js'

/**
 * A repeater — one element per `f.list(...)` field of contract B (fiche 03
 * task 2). It renders exactly what `BLOCK_VOCABULARY` describes and invents
 * no field of its own: adding a "convenient" field here would be a contract B
 * change smuggled through an editor (the fiche's own warning). The value it
 * writes is the same JSON array a hand-typed `f.list` field has always held —
 * this replaces the textarea, not the format.
 */

let itemKeyCounter = 0
/** A repeated item's `_key` (contract B, "une liste garde un `_key` stable par élément") — minted once per item, never recomputed from position. */
function freshItemKey(): string {
  itemKeyCounter += 1
  return `i${Date.now().toString(36)}${itemKeyCounter.toString(36)}`
}

function defaultForItemField(kind: ItemFieldKind): unknown {
  if (kind === 'link') return null
  return defaultValueFor(kind)
}

function blankItem(items: readonly ItemFieldDefinition[], keyed: boolean): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const itemField of items) data[itemField.name] = defaultForItemField(itemField.kind)
  if (keyed) data._key = freshItemKey()
  return data
}

/** The item's own display title: its first non-empty `text` field, falling back to a position label. */
function titleOf(
  item: Readonly<Record<string, unknown>>,
  items: readonly ItemFieldDefinition[],
  position: number,
  fallback: (position: number) => string,
): string {
  for (const itemField of items) {
    if (itemField.kind !== 'text') continue
    const candidate = item[itemField.name]
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate
  }
  return fallback(position)
}

const ITEM_MIME = 'application/x-cogenta-repeater-index'

export function RepeaterField({
  id,
  field,
  value,
  onChange,
  disabled = false,
}: FieldProps<unknown>): JSX.Element {
  const { t } = useTranslation()
  const pickerId = useId()

  const options = field.options as {
    readonly items: readonly ItemFieldDefinition[]
    readonly min?: number
    readonly max?: number
    readonly keyed?: boolean
  }
  const items = options.items
  const keyed = options.keyed ?? true
  const list: readonly Record<string, unknown>[] = Array.isArray(value)
    ? (value as readonly Record<string, unknown>[])
    : []

  const atMax = options.max !== undefined && list.length >= options.max
  const belowMin = options.min !== undefined && list.length < options.min

  function add(): void {
    onChange([...list, blankItem(items, keyed)])
  }

  function removeAt(index: number): void {
    onChange(list.filter((_, i) => i !== index))
  }

  function duplicateAt(index: number): void {
    const source = list[index]
    if (source === undefined) return
    const copy = keyed ? { ...source, _key: freshItemKey() } : { ...source }
    const next = [...list]
    next.splice(index + 1, 0, copy)
    onChange(next)
  }

  function moveTo(fromIndex: number, toIndex: number): void {
    if (toIndex < 0 || toIndex >= list.length) return
    const next = [...list]
    const [moved] = next.splice(fromIndex, 1)
    if (moved === undefined) return
    next.splice(toIndex, 0, moved)
    onChange(next)
  }

  function updateAt(index: number, name: string, itemValue: unknown): void {
    const current = list[index] ?? {}
    onChange(list.map((entry, i) => (i === index ? { ...current, [name]: itemValue } : entry)))
  }

  return (
    <div id={id} className="repeater-field">
      {list.length === 0 ? (
        <p className="field__placeholder">{t('fields.repeaterEmpty')}</p>
      ) : (
        <ol className="repeater-field__items" aria-label={field.admin?.label ?? field.name}>
          {list.map((item, index) => {
            // Non-keyed lists (contract B's `actionSchema` items) have no
            // stable identity to key React on; the index is the honest
            // choice rather than inventing one that would then have to be
            // filtered back out before saving.
            const reactKey = keyed && typeof item._key === 'string' ? item._key : index
            const itemId = `${id}-${reactKey}`
            return (
              <li
                key={reactKey}
                draggable={!disabled}
                onDragStart={(event) => {
                  event.dataTransfer.setData(ITEM_MIME, String(index))
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const raw = event.dataTransfer.getData(ITEM_MIME)
                  if (raw === '') return
                  const fromIndex = Number(raw)
                  if (Number.isInteger(fromIndex)) moveTo(fromIndex, index)
                }}
                className="repeater-field__item"
              >
                <div className="repeater-field__item-header">
                  <span>
                    {titleOf(item, items, index, (position) =>
                      t('fields.repeaterItemFallback', { position: position + 1 }),
                    )}
                  </span>
                  {!disabled && (
                    <div className="repeater-field__item-controls">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={index === 0}
                        aria-label={t('fields.repeaterMoveUp', { position: index + 1 })}
                        onClick={() => moveTo(index, index - 1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={index === list.length - 1}
                        aria-label={t('fields.repeaterMoveDown', { position: index + 1 })}
                        onClick={() => moveTo(index, index + 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={atMax}
                        aria-label={t('fields.repeaterDuplicate', { position: index + 1 })}
                        onClick={() => duplicateAt(index)}
                      >
                        {t('fields.repeaterDuplicateShort')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={t('fields.repeaterRemove', { position: index + 1 })}
                        onClick={() => removeAt(index)}
                      >
                        {t('fields.mediaRemove')}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="repeater-field__item-fields">
                  {items.map((itemField) =>
                    itemField.kind === 'link' ? (
                      <LinkTargetField
                        key={itemField.name}
                        id={`${itemId}-${itemField.name}`}
                        label={itemField.admin?.label ?? itemField.name}
                        required={itemField.required}
                        value={item[itemField.name] as LinkTargetValue}
                        onChange={(next) => updateAt(index, itemField.name, next)}
                        disabled={disabled}
                      />
                    ) : (
                      <FieldInput
                        key={itemField.name}
                        id={`${itemId}-${itemField.name}`}
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
                        value={item[itemField.name] ?? defaultValueFor(itemField.kind)}
                        onChange={(next) => updateAt(index, itemField.name, next)}
                        disabled={disabled}
                      />
                    ),
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {!disabled && (
        <div className="repeater-field__add">
          <Button
            id={pickerId}
            type="button"
            variant="secondary"
            size="sm"
            disabled={atMax}
            onClick={add}
          >
            {t('fields.repeaterAdd')}
          </Button>
          {options.min !== undefined && belowMin && (
            <span className={cn('repeater-field__hint')}>
              {t('fields.repeaterMin', { count: options.min })}
            </span>
          )}
          {options.max !== undefined && (
            <span className="repeater-field__hint">
              {t('fields.repeaterMax', { count: options.max })}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
