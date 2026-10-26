import { DENSITIES, type TokenSpec } from '@cogenta/render/browser'
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import {
  bundledFonts,
  CUSTOM_VALUE,
  EASING_PRESETS,
  type FontRole,
  fontChoice,
  fontStack,
  formatDuration,
  formatLength,
  LENGTH_UNITS,
  type LengthUnit,
  type Preset,
  parseDurationMs,
  parseLength,
  presetChoice,
  roleOfFamily,
  SHADOW_PRESETS,
  SYSTEM_FONT,
  systemFontStack,
  toHexColor,
} from '../lib/appearance-tokens.js'
import { Field, Input, Select } from '../ui/index.js'

/**
 * The controls of the site "Apparence" editor, one per kind of design token.
 *
 * A token is always stored as the plain string contract D already accepts —
 * `0.125rem`, `140ms`, `'Fraunces', Georgia, serif`. What this file changes is
 * how a person enters it: a colour picker beside the hex field, a font list
 * instead of a CSS stack, a number with a unit instead of `0.0625rem`, a
 * handful of named easings and shadows instead of `cubic-bezier(…)`. A value
 * the controls cannot express (written by hand, or by the AI workshop) is kept
 * exactly as it is and shown as "Personnalisée" until the person picks another.
 */

export interface TokenFieldProps {
  readonly spec: TokenSpec
  readonly value: unknown
  onChange(value: unknown): void
}

export function TokenField({ spec, value, onChange }: TokenFieldProps): JSX.Element | null {
  const { t } = useTranslation()
  const label = t(`appearance.token.${spec.group}.${spec.name}`, {
    defaultValue: `${spec.group}.${spec.name}`,
  })
  const help = t(`appearance.tokenHelp.${spec.group}.${spec.name}`, { defaultValue: '' })
  const description = help === '' ? undefined : help

  if (spec.kind === 'boolean') {
    // `motion.reduced` is the only boolean, and contract D requires it to be
    // true: honouring `prefers-reduced-motion` is an accessibility floor, not a
    // preference. A checkbox that cannot be unchecked is a lie, so say it.
    return (
      <p className="m-0 text-xs leading-5 text-muted-foreground sm:col-span-2">
        {t('appearance.reducedMotionNote')}
      </p>
    )
  }

  if (spec.kind === 'density') {
    return (
      <Field label={label} description={description}>
        {(control) => (
          <Select
            {...control}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          >
            {DENSITIES.map((density) => (
              <option key={density} value={density}>
                {t(`appearance.density.${density}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    )
  }

  if (spec.kind === 'ratio') {
    return (
      <Field label={label} description={description}>
        {(control) => (
          <Input
            {...control}
            type="number"
            step="0.01"
            min="1.01"
            value={typeof value === 'number' ? value : ''}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        )}
      </Field>
    )
  }

  if (spec.kind === 'color') {
    return <ColorField label={label} value={value} onChange={onChange} />
  }

  if (spec.kind === 'length') {
    return <LengthField label={label} description={description} value={value} onChange={onChange} />
  }

  if (spec.kind === 'duration') {
    return (
      <DurationField label={label} description={description} value={value} onChange={onChange} />
    )
  }

  if (spec.group === 'font') {
    return (
      <FontField
        label={label}
        description={description}
        role={spec.name as FontRole}
        value={value}
        onChange={onChange}
      />
    )
  }

  if (spec.group === 'motion' && spec.name === 'easing') {
    return (
      <PresetField
        label={label}
        description={description}
        value={value}
        presets={EASING_PRESETS}
        labelKey="appearance.easing"
        onChange={onChange}
      />
    )
  }

  if (spec.group === 'shadow') {
    return (
      <PresetField
        label={label}
        description={description}
        value={value}
        presets={SHADOW_PRESETS[spec.name === 'md' ? 'md' : 'sm']}
        labelKey="appearance.shadow"
        onChange={onChange}
      />
    )
  }

  return (
    <Field label={label} description={description}>
      {(control) => (
        <Input
          {...control}
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  readonly label: string
  readonly value: unknown
  onChange(value: unknown): void
}): JSX.Element {
  const { t } = useTranslation()
  const text = typeof value === 'string' ? value : ''
  const hex = toHexColor(text)
  return (
    <Field label={label}>
      {(control) => (
        <div className="flex items-center gap-2">
          {/* A real colour picker, dressed as the swatch: the swatch used to be
              a dead decoration beside a hex field. */}
          <label
            className="relative block size-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
            style={{ background: text === '' ? 'transparent' : text }}
          >
            <span className="sr-only">{t('appearance.colorPickerLabel', { name: label })}</span>
            <input
              type="color"
              value={hex ?? '#000000'}
              onChange={(event) => onChange(event.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
          <Input
            {...control}
            type="text"
            spellCheck={false}
            value={text}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )}
    </Field>
  )
}

function LengthField({
  label,
  description,
  value,
  onChange,
}: {
  readonly label: string
  readonly description: string | undefined
  readonly value: unknown
  onChange(value: unknown): void
}): JSX.Element {
  const { t } = useTranslation()
  const parsed = parseLength(value)
  if (parsed === null) {
    // Something like `calc(...)`: no number-and-unit form, so keep it editable
    // as the text it is rather than silently rewriting it.
    return (
      <Field label={label} description={description}>
        {(control) => (
          <Input
            {...control}
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
    )
  }
  return (
    <Field label={label} description={description}>
      {(control) => (
        <div className="flex gap-2">
          <Input
            {...control}
            type="number"
            step={parsed.unit === 'px' ? '1' : '0.01'}
            min="0"
            value={parsed.amount}
            onChange={(event) => {
              const amount = Number(event.target.value)
              if (Number.isFinite(amount)) onChange(formatLength(amount, parsed.unit))
            }}
          />
          <Select
            aria-label={t('appearance.unitLabel', { name: label })}
            className="w-24 shrink-0"
            value={parsed.unit}
            onChange={(event) => {
              onChange(formatLength(parsed.amount, event.target.value as LengthUnit))
            }}
          >
            {LENGTH_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </div>
      )}
    </Field>
  )
}

function DurationField({
  label,
  description,
  value,
  onChange,
}: {
  readonly label: string
  readonly description: string | undefined
  readonly value: unknown
  onChange(value: unknown): void
}): JSX.Element {
  const { t } = useTranslation()
  const milliseconds = parseDurationMs(value)
  if (milliseconds === null) {
    return (
      <Field label={label} description={description}>
        {(control) => (
          <Input
            {...control}
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
    )
  }
  return (
    <Field label={label} description={description}>
      {(control) => (
        <div className="flex items-center gap-2">
          <Input
            {...control}
            type="number"
            step="10"
            min="0"
            max="2000"
            value={milliseconds}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (Number.isFinite(next)) onChange(formatDuration(next))
            }}
          />
          <span className="text-sm text-muted-foreground">{t('appearance.millisecondsUnit')}</span>
        </div>
      )}
    </Field>
  )
}

function PresetField({
  label,
  description,
  value,
  presets,
  labelKey,
  onChange,
}: {
  readonly label: string
  readonly description: string | undefined
  readonly value: unknown
  readonly presets: readonly Preset[]
  readonly labelKey: string
  onChange(value: unknown): void
}): JSX.Element {
  const { t } = useTranslation()
  const choice = presetChoice(value, presets)
  return (
    <Field label={label} description={description}>
      {(control) => (
        <Select
          {...control}
          value={choice}
          onChange={(event) => {
            const picked = presets.find((preset) => preset.id === event.target.value)
            if (picked !== undefined) onChange(picked.value)
          }}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {t(`${labelKey}.${preset.id}`)}
            </option>
          ))}
          {choice === CUSTOM_VALUE && (
            <option value={CUSTOM_VALUE}>{t('appearance.customChoice')}</option>
          )}
        </Select>
      )}
    </Field>
  )
}

const FONT_ROLES: readonly FontRole[] = ['sans', 'serif', 'mono']

function FontField({
  label,
  description,
  role,
  value,
  onChange,
}: {
  readonly label: string
  readonly description: string | undefined
  readonly role: FontRole
  readonly value: unknown
  onChange(value: unknown): void
}): JSX.Element {
  const { t } = useTranslation()
  const choice = fontChoice(value, role)
  const fonts = bundledFonts()
  // The kind this token is for comes first, so the likely choices are on top.
  const roles = [role, ...FONT_ROLES.filter((other) => other !== role)]
  return (
    <Field label={label} description={description}>
      {(control) => (
        <Select
          {...control}
          value={choice}
          onChange={(event) => {
            const picked = event.target.value
            if (picked === SYSTEM_FONT) onChange(systemFontStack(role))
            else if (picked !== CUSTOM_VALUE) {
              onChange(fontStack(picked, roleOfFamily(picked, role)))
            }
          }}
        >
          <option value={SYSTEM_FONT}>{t('appearance.fontSystem')}</option>
          {roles.map((group) => (
            <optgroup key={group} label={t(`appearance.fontGroup.${group}`)}>
              {fonts
                .filter((font) => font.role === group)
                .map((font) => (
                  <option key={font.family} value={font.family}>
                    {font.family}
                  </option>
                ))}
            </optgroup>
          ))}
          {choice === CUSTOM_VALUE && (
            <option value={CUSTOM_VALUE}>
              {t('appearance.customFont', {
                name: typeof value === 'string' ? (value.split(',')[0] ?? '') : '',
              })}
            </option>
          )}
        </Select>
      )}
    </Field>
  )
}
