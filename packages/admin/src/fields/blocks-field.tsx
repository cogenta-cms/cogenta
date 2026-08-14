import type { JSX } from 'react'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/** Placeholder — the ordered block editor is task 9, built on the twelve-block vocabulary (contract B). */
export function BlocksField({ id, field }: FieldProps<unknown>): JSX.Element {
  return (
    <FieldWrapper id={id} field={field}>
      <p className="field__placeholder">Éditeur de blocs à venir (tâche 9).</p>
    </FieldWrapper>
  )
}
