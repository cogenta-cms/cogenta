import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldWrapper } from './field-wrapper.js'
import type { FieldProps, GeoValue } from './types.js'

/**
 * A tile URL template (`{z}`/`{x}`/`{y}`), read once at build time and empty
 * unless a self-hoster sets `VITE_MAP_TILE_URL` — the same pattern
 * `schema-context.tsx` already uses for `VITE_API_BASE_URL`. Empty means the
 * map toggle below never renders and this field never makes a network
 * request, which is what keeps a site with no configuration R1/R2-honest.
 */
const TILE_URL_TEMPLATE = import.meta.env['VITE_MAP_TILE_URL'] ?? ''

const ZOOM = 14

/**
 * Web Mercator tile coordinates for one point, per the standard OSM/Slippy
 * Map formula. Truncated to the containing tile — the marker below is what
 * places the point *within* that tile, since a tile is the smallest unit a
 * static image can address.
 */
function tileFor(
  lat: number,
  lng: number,
  zoom: number,
): { readonly x: number; readonly y: number } {
  const latRad = (lat * Math.PI) / 180
  const n = 2 ** zoom
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return { x, y }
}

function tileUrl(template: string, x: number, y: number, zoom: number): string {
  return template
    .replaceAll('{z}', String(zoom))
    .replaceAll('{x}', String(x))
    .replaceAll('{y}', String(y))
}

/**
 * A static 3×3 tile grid centred on the point, not an interactive slippy
 * map: R9 rules out a mapping library for a preview, and a hand-rolled
 * pan/zoom widget would be exactly the kind of home-grown complexity
 * AGENTS.md warns against for a "confort" gap. The marker is placed at the
 * centre tile's centre — close to the real point, not pixel-exact, which is
 * an honest trade for zero dependencies and is disclosed in the label below.
 */
function StaticMap({ lat, lng }: { readonly lat: number; readonly lng: number }): JSX.Element {
  const { t } = useTranslation()
  const center = tileFor(lat, lng, ZOOM)
  const offsets = [-1, 0, 1]

  return (
    <div className="field__map-tiles" role="img" aria-label={t('fields.geoMapAlt')}>
      {offsets.flatMap((dy) =>
        offsets.map((dx) => (
          <img
            key={`${dx}:${dy}`}
            src={tileUrl(TILE_URL_TEMPLATE, center.x + dx, center.y + dy, ZOOM)}
            alt=""
            aria-hidden="true"
          />
        )),
      )}
      <span className="field__map-marker" aria-hidden="true" />
    </div>
  )
}

export function GeoField({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: FieldProps<GeoValue | null>): JSX.Element {
  const { t } = useTranslation()
  const [showMap, setShowMap] = useState(false)
  const lat = value?.lat ?? null
  const lng = value?.lng ?? null

  function setLat(next: number | null): void {
    onChange(next === null && lng === null ? null : { lat: next ?? 0, lng: lng ?? 0 })
  }
  function setLng(next: number | null): void {
    onChange(lat === null && next === null ? null : { lat: lat ?? 0, lng: next ?? 0 })
  }

  return (
    <FieldWrapper
      id={id}
      field={field}
      value={value}
      onReset={() => onChange(field.default as GeoValue | null)}
      error={error ?? null}
    >
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

      {TILE_URL_TEMPLATE !== '' && lat !== null && lng !== null && (
        <div className="field__map">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowMap((current) => !current)}
          >
            {showMap ? t('fields.geoMapHide') : t('fields.geoMapShow')}
          </button>
          {showMap && <StaticMap lat={lat} lng={lng} />}
        </div>
      )}
    </FieldWrapper>
  )
}
