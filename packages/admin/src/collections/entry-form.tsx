import { type JSX, useEffect, useMemo, useRef } from 'react'
import type { BlockZones } from '../api/content-client.js'
import { defaultValueFor } from '../fields/default-value.js'
import { FieldInput } from '../fields/field-input.js'
import type { RichTextDocument } from '../rich-text/portable-text.js'
import type { CollectionSummary, SchemaField } from '../schema/types.js'
import { ExcerptAssistButton } from './excerpt-assist-button.js'
import { plainTextOfRichText, truncateAtWordBoundary } from './word-count.js'

/** The conventional field name (fiche 44), same convention as `seo-panel.tsx`'s `seoTitle`/`seoDescription`. */
const EXCERPT_FIELD_NAME = 'excerpt'

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
  token,
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
  /**
   * Fiche 44 task 3 — the signed-in actor's own session token, needed only to
   * ask `GET /api/assistant` whether `assist.summarise` is available for the
   * "generate the excerpt with AI" button next to a conventional `excerpt`
   * field. `null` (no session yet) simply means that button never renders —
   * every other field keeps working exactly as before (R2).
   */
  readonly token: string | null
}): JSX.Element {
  const fields = collection.fields.filter((field) => skipFields?.has(field.name) !== true)

  const ungrouped = fields.filter((field) => field.admin?.group === undefined)
  const groupNames: string[] = []
  for (const field of fields) {
    const group = field.admin?.group
    if (group !== undefined && !groupNames.includes(group)) groupNames.push(group)
  }

  /**
   * Fiche 44 tasks 2-3 — purely conventional, exactly like `seo-panel.tsx`'s
   * `seoTitle`/`seoDescription`: a collection that declares neither an
   * `excerpt` text field nor a `richText` field (most of them, today) gets
   * none of what follows, at zero cost.
   */
  const excerptField = collection.fields.find(
    (field) => field.kind === 'text' && field.name === EXCERPT_FIELD_NAME,
  )
  const bodyField = collection.fields.find((field) => field.kind === 'richText')
  const bodyValue = bodyField === undefined ? undefined : values[bodyField.name]
  const bodyPlainText = useMemo(
    () => plainTextOfRichText(bodyValue as RichTextDocument | null | undefined),
    [bodyValue],
  )

  /**
   * Fiche 44 task 2 — the default auto-fill: "the start of the body text",
   * kept in sync until the author's own edit no longer matches what this
   * effect last wrote — the same "auto-fillable until overridden" rule
   * `entry-edit.tsx`'s own slug-from-title already uses, tracked here the
   * same way, by remembering the last value *this* effect produced rather
   * than a plain touched/untouched flag.
   */
  const autoFilledExcerptRef = useRef<string | null>(null)
  useEffect(() => {
    if (excerptField === undefined || bodyField === undefined) return
    if (bodyPlainText === '') return
    const current = values[excerptField.name]
    const currentText = typeof current === 'string' ? current : ''
    const autoFillable = currentText === '' || currentText === autoFilledExcerptRef.current
    if (!autoFillable) return
    const max =
      typeof excerptField.options.max === 'number' ? excerptField.options.max : bodyPlainText.length
    const generated = truncateAtWordBoundary(bodyPlainText, max)
    if (generated === currentText) return
    autoFilledExcerptRef.current = generated
    onChange(excerptField.name, generated)
    // `values`/`onChange` deliberately left out: `bodyPlainText` already
    // captures the one part of `values` this effect cares about, and
    // `onChange` is a fresh function every render in the real caller
    // (`entry-edit.tsx`'s `setFieldValue`) — listing it would re-run this
    // effect every keystroke anywhere else in the form for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excerptField, bodyField, bodyPlainText])

  function renderField(field: SchemaField): JSX.Element {
    if (field.kind === 'blocks') {
      return (
        <FieldInput
          key={field.name}
          id={`field-${field.name}`}
          field={field}
          value={blocks[field.name] ?? []}
          onChange={(value) => onBlocksChange(field.name, value)}
          disabled={disabled}
          error={errors?.[field.name] ?? null}
        />
      )
    }

    const input = (
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

    // Fiche 44 task 3 — the AI button lives right next to the field it
    // fills, never floating elsewhere on the screen: `EntryForm` is the only
    // place that already knows both "this is the excerpt field" and "this is
    // its sibling body field", so it composes the two here rather than
    // teaching a generic extension point to `FieldInput` for one field name.
    // Every other field keeps rendering exactly as before, unwrapped — the
    // group's `.field:last-child` spacing rule depends on that. `input`'s own
    // `key` is harmless but unused once it stops being a direct array child
    // here — the wrapping `<div>` below carries the real one.
    if (field === excerptField && bodyField !== undefined && token !== null) {
      return (
        <div key={field.name} className="flex flex-col gap-1.5">
          {input}
          <ExcerptAssistButton
            token={token}
            bodyText={bodyPlainText}
            onChange={(value) => onChange(field.name, value)}
            disabled={disabled}
          />
        </div>
      )
    }

    return input
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
