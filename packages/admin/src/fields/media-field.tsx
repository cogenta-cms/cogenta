import type { JSX } from 'react'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

/** Placeholder — upload, real-type verification and the image pipeline are task 11. */
export function MediaField({ id, field }: FieldProps<unknown>): JSX.Element {
  return (
    <FieldWrapper id={id} field={field}>
      <p className="field__placeholder">Médiathèque à venir (tâche 11).</p>
    </FieldWrapper>
  )
}
