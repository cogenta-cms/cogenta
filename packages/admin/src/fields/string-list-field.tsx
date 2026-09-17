import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/index.js'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * A plain list of short texts (L36 audit): the features of a pricing tier,
 * which contract B stores as an array of strings and the admin showed as a
 * JSON textarea. One line per entry, added, removed and reordered in place.
 */
export function StringListField({
  id,
  field,
  value,
  onChange,
  disabled = false,
  error,
}: FieldProps<unknown>): JSX.Element {
  const { t } = useTranslation()
  const list: readonly string[] = Array.isArray(value)
    ? value.map((entry) => (typeof entry === 'string' ? entry : ''))
    : []
  const set = (next: readonly string[]) => onChange(next)

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      <ol id={id} className="m-0 flex list-none flex-col gap-2 p-0">
        {list.map((entry, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: plain strings carry no identity of their own
          <li key={index} className="flex items-center gap-1">
            <input
              aria-label={t('fields.stringListItem', { position: index + 1 })}
              className="min-w-0 flex-1"
              type="text"
              value={entry}
              disabled={disabled}
              onChange={(event) => set(list.map((v, i) => (i === index ? event.target.value : v)))}
            />
            {!disabled && (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={index === 0}
                  aria-label={t('fields.repeaterMoveUp', { position: index + 1 })}
                  onClick={() => {
                    const next = [...list]
                    next.splice(index - 1, 0, ...next.splice(index, 1))
                    set(next)
                  }}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t('fields.repeaterRemove', { position: index + 1 })}
                  onClick={() => set(list.filter((_, i) => i !== index))}
                >
                  ×
                </Button>
              </>
            )}
          </li>
        ))}
      </ol>
      {!disabled && (
        <div>
          <Button type="button" size="sm" variant="secondary" onClick={() => set([...list, ''])}>
            {t('fields.repeaterAdd')}
          </Button>
        </div>
      )}
    </FieldWrapper>
  )
}
