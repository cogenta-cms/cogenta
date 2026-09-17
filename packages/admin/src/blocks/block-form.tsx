import { type JSX, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { defaultValueFor } from '../fields/default-value.js'
import { FieldInput } from '../fields/field-input.js'
import { useSchema } from '../schema/schema-context.js'
import { EmbedAssist } from './embed-assist.js'
import { localizeBlockField } from './localize-block-fields.js'
import type { BlockDefinition } from './vocabulary.js'

/**
 * One placed block's own typed fields, generated from its vocabulary entry —
 * the same "schema in, form out" shape as `EntryForm` (task 7), so a block
 * added to the vocabulary needs no bespoke editor (ADR-0009: "l'admin est
 * généré depuis le schéma").
 *
 * Labels and option values are shown in the admin's language, and a list of
 * entries offers the site's own collections and a way to edit what it lists
 * (L36 audit): a list block shows entries, and those are edited where they
 * live, not in the page.
 */
export function BlockForm({
  idPrefix,
  definition,
  data,
  onChange,
  disabled = false,
}: {
  readonly idPrefix: string
  readonly definition: BlockDefinition
  readonly data: Readonly<Record<string, unknown>>
  onChange(data: Readonly<Record<string, unknown>>): void
  readonly disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const schemaState = useSchema()
  const collections = schemaState.status === 'ready' ? schemaState.schema.collections : []
  const fields = useMemo(
    () => definition.fields.map((field) => localizeBlockField(field, t, collections)),
    [definition, t, collections],
  )
  const listed =
    definition.name === 'collectionList' && typeof data['collection'] === 'string'
      ? collections.find((collection) => collection.name === data['collection'])
      : undefined

  return (
    <>
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          id={`${idPrefix}-${field.name}`}
          field={field}
          value={data[field.name] ?? defaultValueFor(field.kind)}
          onChange={(value) => onChange({ ...data, [field.name]: value })}
          disabled={disabled}
        />
      ))}
      {definition.name === 'embed' && (
        <EmbedAssist data={data} onChange={onChange} disabled={disabled} />
      )}
      {listed !== undefined && (
        <p className="m-0 text-sm">
          {t('builder.listedEntriesHint', { collection: listed.labels.plural })}{' '}
          <Link to={`/collections/${encodeURIComponent(listed.name)}`}>
            {t('builder.listedEntriesLink', { collection: listed.labels.plural })}
          </Link>
        </p>
      )}
    </>
  )
}
