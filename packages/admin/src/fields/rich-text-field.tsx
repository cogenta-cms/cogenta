import type { JSX } from 'react'
import { useAuth } from '../auth/auth-context.js'
import type { RichTextDocument } from '../rich-text/portable-text.js'
import { RichTextEditor } from '../rich-text/rich-text-editor.js'
import type { RichTextSession } from '../rich-text/session.js'
import { useSchema } from '../schema/schema-context.js'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps } from './types.js'

const EMPTY: RichTextDocument = []

export function RichTextField({
  id,
  field,
  value,
  onChange,
  disabled,
}: FieldProps<RichTextDocument | undefined>): JSX.Element {
  const auth = useAuth()
  const schema = useSchema()

  // The internal-link tab and the image picker (fiche 04 tasks 2-3) need a
  // real session and a real schema; a field rendered before either is ready
  // — or in a bare unit test with neither provider mounted — still formats
  // text, it just cannot offer those two.
  const session: RichTextSession | undefined =
    auth.state.status === 'authenticated' && schema.status === 'ready'
      ? {
          token: auth.state.token,
          roles: auth.state.user.roles,
          collections: schema.schema.collections,
        }
      : undefined

  return (
    <FieldWrapper id={id} field={field}>
      <RichTextEditor
        id={id}
        value={value ?? EMPTY}
        disabled={disabled}
        onChange={onChange}
        session={session}
      />
    </FieldWrapper>
  )
}
