import { type JSX, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { defaultValueFor } from '../fields/default-value.js'
import { FieldInput } from '../fields/field-input.js'
import { useSchema } from '../schema/schema-context.js'
import { EmbedAssist } from './embed-assist.js'
import { dateFieldsOf, localizeBlockField } from './localize-block-fields.js'
import { readUpcomingOnly, withUpcomingOnly } from './upcoming-filter.js'
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
  const listed =
    definition.name === 'collectionList' && typeof data['collection'] === 'string'
      ? collections.find((collection) => collection.name === data['collection'])
      : undefined
  const fields = useMemo(
    () => definition.fields.map((field) => localizeBlockField(field, t, collections, listed)),
    [definition, t, collections, listed],
  )
  // "Only what is still to come" needs a date to compare against, and the one
  // the list is already ordered by is the only one that makes the two agree
  // (L40, ADR-0038).
  const sortedBy = (data['sort'] as { field?: unknown } | undefined)?.field
  const upcomingField =
    typeof sortedBy === 'string' && dateFieldsOf(listed).some((field) => field.name === sortedBy)
      ? sortedBy
      : undefined
  const upcoming = upcomingField === undefined ? false : readUpcomingOnly(data, upcomingField)

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
      {upcomingField !== undefined && (
        <label className="flex items-center gap-2 text-sm" htmlFor={`${idPrefix}-upcoming`}>
          <input
            id={`${idPrefix}-upcoming`}
            type="checkbox"
            checked={upcoming}
            disabled={disabled}
            onChange={(event) =>
              onChange(withUpcomingOnly(data, upcomingField, event.target.checked))
            }
          />
          {t('builder.upcomingOnly')}
        </label>
      )}
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
