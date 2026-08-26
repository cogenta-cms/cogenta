import {
  BLOCK_VARIANT_ALIGNS,
  BLOCK_VARIANT_BACKGROUNDS,
  BLOCK_VARIANT_SPACINGS,
  BLOCK_VARIANT_WIDTHS,
  type BlockVariant,
} from '@cogenta/blocks'
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { Field, Select } from '../ui/index.js'

/**
 * Per-instance visual variant (contract B, `blocks@2.0`, RFC 0002).
 *
 * Four independent axes, each a closed set of semantic tokens — never a
 * colour or a size, so this stays a selector of *intent* the active theme
 * resolves as it sees fit, exactly the same indirection the skin's colour
 * tokens already use. "Theme default" (an empty selection) is what an axis
 * this component never touched looks like: it is not a fifth token, it is
 * the absence of the key on `variant` itself — which is why `withAxis`
 * below deletes rather than sets a value for it.
 */

type VariantAxis = 'background' | 'spacing' | 'align' | 'width'

const AXES: readonly {
  readonly axis: VariantAxis
  readonly labelKey: string
  readonly options: readonly string[]
}[] = [
  { axis: 'background', labelKey: 'backgroundLabel', options: BLOCK_VARIANT_BACKGROUNDS },
  { axis: 'spacing', labelKey: 'spacingLabel', options: BLOCK_VARIANT_SPACINGS },
  { axis: 'align', labelKey: 'alignLabel', options: BLOCK_VARIANT_ALIGNS },
  { axis: 'width', labelKey: 'widthLabel', options: BLOCK_VARIANT_WIDTHS },
]

/**
 * `value` only ever arrives here as `''` (the "theme default" option) or one
 * of `axis`'s own closed option list, both of which are `BlockVariant[axis]`
 * members — the assignment below states that fact rather than reaching for
 * `any`. An empty result collapses to `undefined`, so a block whose author
 * cleared every axis stores no `variant` at all, not an empty object that
 * would still have to be told apart from "never touched".
 *
 * Built from `Object.entries` rather than an object spread + `delete`:
 * `BlockVariant`'s fields are `string | undefined` at the type level, and
 * `exactOptionalPropertyTypes` refuses ever holding an explicit `undefined`
 * in a plain `Record<string, string>` — entries only ever exist here when
 * they carry a real value, so the distinction cannot arise.
 */
function withAxis(
  variant: BlockVariant | undefined,
  axis: VariantAxis,
  value: string,
): BlockVariant | undefined {
  // Widened to the general tuple shape explicitly: `Object.entries` would
  // otherwise infer `BlockVariant`'s own literal-union value type here,
  // which a fresh `string` from a `<select>` cannot be narrowed to without
  // reaching for `any` — the cast states the same fact `withAxis`'s own
  // doc comment already does, once, rather than per push below.
  const entries = Object.entries(variant ?? {}) as [VariantAxis, string][]
  const kept = entries.filter(([key]) => key !== axis)
  if (value !== '') kept.push([axis, value])
  return kept.length === 0 ? undefined : (Object.fromEntries(kept) as BlockVariant)
}

export function BlockVariantControl({
  variant,
  disabled = false,
  onChange,
}: {
  readonly variant: BlockVariant | undefined
  readonly disabled?: boolean
  onChange(next: BlockVariant | undefined): void
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <fieldset
      className="m-0 flex flex-col gap-3 border-0 p-0"
      aria-label={t('builder.variant.heading')}
    >
      <legend className="p-0 font-sans text-sm font-medium text-foreground">
        {t('builder.variant.heading')}
      </legend>
      {AXES.map(({ axis, labelKey, options }) => (
        <Field key={axis} label={t(`builder.variant.${labelKey}`)}>
          {(control) => (
            <Select
              {...control}
              disabled={disabled}
              value={variant?.[axis] ?? ''}
              onChange={(event) => onChange(withAxis(variant, axis, event.target.value))}
            >
              <option value="">{t('builder.variant.default')}</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {t(`builder.variant.${axis}.${option}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ))}
    </fieldset>
  )
}
