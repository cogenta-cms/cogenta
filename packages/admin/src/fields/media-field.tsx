import type { JSX } from 'react'
import { MEDIA_KINDS, type MediaKind } from '../api/media-client.js'
import { useAuth } from '../auth/auth-context.js'
import { FieldWrapper } from './field-wrapper.js'
import { MediaPicker } from './media-picker.js'
import type { FieldProps } from './types.js'

/**
 * `f.media({ accept, many })` (fiche 03 task 3): a real picker, filtered by
 * whatever the field actually declared rather than the `kind: 'image'`
 * constant this used to hard-code, with a working `many: true` — both the
 * admin *and* the store side of that were incomplete (`@cogenta/schema`'s
 * `columnTypeFor`/`encodeFieldValue` only ever handled a scalar id; fixed
 * alongside this, since an admin that lets someone drop four images into a
 * field that then throws `CONTENT_INVALID` on save is worse than no admin
 * at all).
 */
export function MediaField({
  id,
  field,
  value,
  onChange,
  disabled = false,
}: FieldProps<unknown>): JSX.Element {
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const options = field.options as {
    readonly accept?: readonly MediaKind[]
    readonly many?: boolean
  }
  const accept = options.accept ?? MEDIA_KINDS
  const many = options.many === true

  const normalised: readonly string[] = many
    ? Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : []
    : typeof value === 'string' && value.length > 0
      ? [value]
      : []

  function handleChange(ids: readonly string[]): void {
    onChange(many ? ids : (ids[0] ?? null))
  }

  if (token === null) {
    return (
      <FieldWrapper id={id} field={field}>
        <p>…</p>
      </FieldWrapper>
    )
  }

  return (
    <FieldWrapper id={id} field={field}>
      <MediaPicker
        id={id}
        token={token}
        accept={accept}
        many={many}
        value={normalised}
        onChange={handleChange}
        disabled={disabled}
      />
    </FieldWrapper>
  )
}
