import type { JSX } from 'react'
import type { BlockZones } from '../api/content-client.js'
import { defaultValueFor } from '../fields/default-value.js'
import { FieldInput } from '../fields/field-input.js'
import type { CollectionSummary, SchemaField } from '../schema/types.js'

/**
 * L2 task 7: one `FieldInput` per declared field, generated from
 * `schema.json` — adding a field to the schema needs no admin change at
 * all, which is the lot's own acceptance criterion.
 *
 * A `blocks`-kind field reads and writes its own zone rather than `values`:
 * the REST wire shape keeps block zones at `entry.blocks[fieldName]`,
 * separate from `entry.values` (`packages/api/src/content/serialise.ts`).
 *
 * Field groups (fiche 02 task 6): contract A already carries `admin.group`
 * per field (`packages/schema/src/types.ts`'s `FieldAdminOptions`, wired
 * through `generate-schema-json.ts`'s `describeAdmin` since `schema@2.0`) —
 * this needed no contract change at all, only rendering it. A field with no
 * `admin.group` renders exactly as before, flat, before any grouped section;
 * a collection that declares no group anywhere therefore renders byte-for-byte
 * as it always has, which is the whole point of this being a convention
 * rather than something every collection must opt into.
 */
export function EntryForm({
  collection,
  values,
  blocks,
  onChange,
  onBlocksChange,
  disabled = false,
  skipFields,
  errors,
}: {
  readonly collection: CollectionSummary
  readonly values: Readonly<Record<string, unknown>>
  readonly blocks: BlockZones
  onChange(name: string, value: unknown): void
  onBlocksChange(zone: string, value: unknown): void
  readonly disabled?: boolean
  /**
   * Fields this form leaves to something else on the same screen.
   *
   * The visual page builder (L16) composes one block zone itself, and would
   * otherwise be showing the same zone twice, in two editors, with two
   * opinions about what it contains. Everything not named here is still edited
   * here, so the typed fields never become unreachable in builder mode.
   */
  readonly skipFields?: ReadonlySet<string>
  /** A validation message per field name (fiche 02 task 3), keyed exactly like `values`. */
  readonly errors?: Readonly<Record<string, string>>
}): JSX.Element {
  const fields = collection.fields.filter((field) => skipFields?.has(field.name) !== true)

  const ungrouped = fields.filter((field) => field.admin?.group === undefined)
  const groupNames: string[] = []
  for (const field of fields) {
    const group = field.admin?.group
    if (group !== undefined && !groupNames.includes(group)) groupNames.push(group)
  }

  function renderField(field: SchemaField): JSX.Element {
    return field.kind === 'blocks' ? (
      <FieldInput
        key={field.name}
        id={`field-${field.name}`}
        field={field}
        value={blocks[field.name] ?? []}
        onChange={(value) => onBlocksChange(field.name, value)}
        disabled={disabled}
        error={errors?.[field.name] ?? null}
      />
    ) : (
      <FieldInput
        key={field.name}
        id={`field-${field.name}`}
        field={field}
        value={values[field.name] ?? field.default ?? defaultValueFor(field.kind)}
        onChange={(value) => onChange(field.name, value)}
        disabled={disabled}
        error={errors?.[field.name] ?? null}
      />
    )
  }

  return (
    <>
      {ungrouped.map(renderField)}
      {groupNames.map((group) => (
        // Open by default: these are the entry's own content fields, not a
        // secondary panel — a closed group would hide required fields behind
        // an extra click on every single visit to this screen.
        <details key={group} open className="entry-form__group">
          <summary>{group}</summary>
          <div className="entry-form__group-body">
            {fields.filter((field) => field.admin?.group === group).map(renderField)}
          </div>
        </details>
      ))}
    </>
  )
}
