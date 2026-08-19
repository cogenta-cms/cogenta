import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps, GeoValue } from './types.js'

export function GeoField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<GeoValue | null>): JSX.Element {
  const { t } = useTranslation()
  const lat = value?.lat ?? null
  const lng = value?.lng ?? null

  function setLat(next: number | null): void {
    onChange(next === null && lng === null ? null : { lat: next ?? 0, lng: lng ?? 0 })
  }
  function setLng(next: number | null): void {
    onChange(lat === null && next === null ? null : { lat: lat ?? 0, lng: next ?? 0 })
  }

  return (
    <FieldWrapper id={id} field={field} error={error ?? null}>
      <div className="field__geo">
        <label htmlFor={`${id}-lat`}>{t('fields.geoLat')}</label>
        <input
          id={`${id}-lat`}
          type="number"
          step="any"
          min={-90}
          max={90}
          disabled={disabled}
          value={lat ?? ''}
          onChange={(event) =>
            setLat(event.target.value === '' ? null : Number(event.target.value))
          }
        />
        <label htmlFor={`${id}-lng`}>{t('fields.geoLng')}</label>
        <input
          id={`${id}-lng`}
          type="number"
          step="any"
          min={-180}
          max={180}
          disabled={disabled}
          value={lng ?? ''}
          onChange={(event) =>
            setLng(event.target.value === '' ? null : Number(event.target.value))
          }
        />
      </div>
    </FieldWrapper>
  )
}
