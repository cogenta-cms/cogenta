import type { JSX } from 'react'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/**
 * Placeholder — the structured editor is task 8, "le composant le plus
 * coûteux de tout le projet" per the lot's own warning, and is built on a
 * proven base rather than from scratch. Edits the serialised tree as raw
 * JSON in the meantime, which is honest about what it is and never silently
 * drops content the way a half-built rich text UI would.
 */
export function RichTextField({
  id,
  field,
  value,
  onChange,
  disabled,
}: FieldProps<unknown>): JSX.Element {
  return (
    <FieldWrapper id={id} field={field}>
      <textarea
        id={id}
        disabled={disabled}
        value={JSON.stringify(value, null, 2) ?? ''}
        onChange={(event) => {
          try {
            onChange(JSON.parse(event.target.value))
          } catch {
            // Left uncommitted until valid, same as JsonField — no partial-parse state.
          }
        }}
      />
      <p className="field__help">
        Éditeur de texte riche structuré à venir (tâche 8) — JSON brut pour l'instant.
      </p>
    </FieldWrapper>
  )
}
