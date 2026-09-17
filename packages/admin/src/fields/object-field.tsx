import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { ItemFieldDefinition } from '../blocks/vocabulary.js'
import { Button } from '../ui/index.js'
import { FieldWrapper } from './field-wrapper.js'
import { ItemFieldInput } from './item-field-input.js'
import type { FieldProps } from './types.js'

/**
 * A structured value edited as its own fields (L36 audit): a testimonial's
 * attribution (name, role, portrait), a pricing tier's button, a list's sort.
 * These were JSON textareas, which is not something an editor should have to
 * type. The value written is the same object; an optional one can be removed
 * entirely, which is how contract B spells "absent".
 */
export function ObjectField({
  id,
  field,
  value,
  onChange,
  disabled = false,
  error,
}: FieldProps<unknown>): JSX.Element {
  const { t } = useTranslation()
  const items = (field.options as { readonly items: readonly ItemFieldDefinition[] }).items
  const current =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Readonly<Record<string, unknown>>)
      : null
  const present = current !== null && Object.keys(current).length > 0

  if (!field.required && !present) {
    return (
      <FieldWrapper id={id} field={field} error={error ?? null}>
        <div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange({})}
          >
            {t('fields.objectAdd')}
          </Button>
        </div>
      </FieldWrapper>
    )
  }

  const data = current ?? {}
  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      <div id={id} className="repeater-field__item-fields object-field">
        {items.map((itemField) => (
          <ItemFieldInput
            key={itemField.name}
            id={`${id}-${itemField.name}`}
            itemField={itemField}
            value={data[itemField.name]}
            onChange={(next) => onChange({ ...data, [itemField.name]: next })}
            disabled={disabled}
          />
        ))}
        {!field.required && !disabled && (
          <div>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              {t('fields.objectRemove')}
            </Button>
          </div>
        )}
      </div>
    </FieldWrapper>
  )
}
