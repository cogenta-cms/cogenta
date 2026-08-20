import { type JSX, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/auth-context.js'
import { readableCollections } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { Label, Select } from '../ui/index.js'
import { EntryPicker } from './entry-picker.js'

/**
 * Contract B's `LinkTarget` (`packages/blocks/src/action.ts`): either an
 * external URL, or a reference into a collection this admin already knows
 * how to browse. This is the field editor for it — there is no `SchemaField`
 * kind that represents a union, so `RepeaterField` renders this directly
 * for any item field of kind `'link'` rather than routing it through
 * `FieldInput`.
 */
export type LinkTargetValue =
  | { readonly href: string }
  | { readonly collection: string; readonly id: string }
  | null

export interface LinkTargetFieldProps {
  readonly id: string
  readonly label: string
  readonly required?: boolean
  readonly value: LinkTargetValue
  onChange(value: LinkTargetValue): void
  readonly disabled?: boolean
}

function isEntryTarget(
  value: LinkTargetValue,
): value is { readonly collection: string; readonly id: string } {
  return value != null && 'collection' in value
}

export function LinkTargetField({
  id,
  label,
  required = false,
  value,
  onChange,
  disabled = false,
}: LinkTargetFieldProps): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const schema = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const typeId = useId()
  const urlId = useId()
  const collectionId = useId()

  const mode = isEntryTarget(value) ? 'entry' : 'url'
  const collections =
    schema.status === 'ready' ? readableCollections(schema.schema.collections, roles) : []
  const targetCollectionName = isEntryTarget(value) ? value.collection : ''
  const targetCollection = collections.find((candidate) => candidate.name === targetCollectionName)

  function setMode(next: 'url' | 'entry'): void {
    if (next === 'url') onChange({ href: '' })
    else onChange({ collection: collections[0]?.name ?? '', id: '' })
  }

  return (
    <div className="field field--link-target">
      <fieldset id={typeId} className="field__link-target-type">
        <legend>{label}</legend>
        <label>
          <input
            type="radio"
            name={`${id}-mode`}
            checked={mode === 'url'}
            disabled={disabled}
            onChange={() => setMode('url')}
          />
          {t('fields.linkTargetTypeUrl')}
        </label>
        <label>
          <input
            type="radio"
            name={`${id}-mode`}
            checked={mode === 'entry'}
            disabled={disabled || collections.length === 0}
            onChange={() => setMode('entry')}
          />
          {t('fields.linkTargetTypeEntry')}
        </label>
      </fieldset>

      {mode === 'url' ? (
        <>
          <Label htmlFor={urlId}>{t('fields.linkTargetUrlLabel')}</Label>
          <input
            id={urlId}
            type="text"
            required={required}
            disabled={disabled}
            value={isEntryTarget(value) ? '' : (value?.href ?? '')}
            onChange={(event) => onChange({ href: event.target.value })}
          />
        </>
      ) : (
        <>
          <Label htmlFor={collectionId}>{t('fields.linkTargetCollectionLabel')}</Label>
          <Select
            id={collectionId}
            disabled={disabled}
            value={targetCollectionName}
            onChange={(event) => onChange({ collection: event.target.value, id: '' })}
          >
            <option value="" disabled>
              {t('fields.linkTargetCollectionPlaceholder')}
            </option>
            {collections.map((collection) => (
              <option key={collection.name} value={collection.name}>
                {collection.labels.plural}
              </option>
            ))}
          </Select>

          {targetCollectionName !== '' && token !== null && (
            <EntryPicker
              id={`${id}-entry`}
              token={token}
              collection={targetCollection}
              roles={roles}
              many={false}
              value={isEntryTarget(value) && value.id !== '' ? [value.id] : []}
              onChange={(ids) => onChange({ collection: targetCollectionName, id: ids[0] ?? '' })}
              disabled={disabled}
            />
          )}
        </>
      )}
    </div>
  )
}
