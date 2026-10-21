import type { TFunction } from 'i18next'

/**
 * A file size in the reader's own units and number format: `4,9 Ko` in French,
 * `4.9 KB` in English (binary steps, one decimal under ten, none above).
 */
export function formatBytes(bytes: number, t: TFunction, locale: string): string {
  const units = ['units.byte', 'units.kilobyte', 'units.megabyte', 'units.gigabyte'] as const
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 || value >= 10 ? 0 : 1,
  }).format(value)
  return `${number} ${t(units[unit] ?? 'units.byte')}`
}

/** `image/jpeg` → `JPEG`, `image/svg+xml` → `SVG`: the names a person knows, for a list of accepted formats. */
export function imageFormatName(mimeType: string): string {
  const subtype = mimeType.replace(/^image\//u, '').replace(/\+xml$/u, '')
  return subtype.toUpperCase()
}
