import { type JSX, useMemo } from 'react'
import { encodeQr } from '../lib/qr-encode.js'

/** Light modules around the code that a scanner needs (the spec asks for four). */
const QUIET_ZONE = 4

/**
 * An inline-SVG QR Code. It is dark on a white ground in both colour schemes
 * on purpose: scanners expect dark-on-light, and a dark-mode inversion would
 * make the code unreadable.
 */
export function QrCode({
  value,
  label,
}: {
  readonly value: string
  readonly label: string
}): JSX.Element | null {
  const rows = useMemo(() => {
    try {
      return encodeQr(value)
    } catch {
      return null
    }
  }, [value])
  if (rows === null) return null
  const size = rows.length + QUIET_ZONE * 2
  const path = rows
    .flatMap((row, y) =>
      row.map((dark, x) => (dark ? `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z` : '')),
    )
    .join('')
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-44 max-w-full rounded-md border border-border"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
