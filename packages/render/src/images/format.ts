import type { ImageFormat } from './types.js'

/**
 * Container sniffing, shared by both tiers.
 *
 * The pipeline decides what a byte string *is* before any decoder sees it, and
 * it does so from the magic bytes rather than from a filename or an uploaded
 * `Content-Type` — both of which are attacker-controlled. Two things follow, and
 * both matter:
 *
 * - "unsupported format" is one behaviour on every host, not whatever the
 *   installed codec happened to be built with. A site that renders a TIFF on the
 *   maintainer's laptop and 500s on the shared host is the failure mode rule R1
 *   exists to prevent.
 * - the message names the format the user actually uploaded, so "GIF is not
 *   supported" reaches them instead of a decoder stack trace.
 */

const MIME: Readonly<Record<ImageFormat, string>> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** Suffix libvips and sharp both understand for an output format. */
const SUFFIX: Readonly<Record<ImageFormat, string>> = {
  avif: '.avif',
  webp: '.webp',
  jpeg: '.jpg',
  png: '.png',
}

export function contentTypeOf(format: ImageFormat): string {
  return MIME[format]
}

export function suffixOf(format: ImageFormat): string {
  return SUFFIX[format]
}

function starts(bytes: Uint8Array, offset: number, ascii: string): boolean {
  if (bytes.length < offset + ascii.length) return false
  for (let index = 0; index < ascii.length; index += 1) {
    if (bytes[offset + index] !== ascii.charCodeAt(index)) return false
  }
  return true
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]

/** ISO base media brands that are AVIF, and the ones that are its HEIF cousins. */
const AVIF_BRANDS = new Set(['avif', 'avis'])
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'])

function brandOf(bytes: Uint8Array): string | null {
  if (!starts(bytes, 4, 'ftyp') || bytes.length < 12) return null
  return String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0)
}

/** The format, or `null` when this is not something the pipeline can decode. */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWithBytes(bytes, PNG_SIGNATURE)) return 'png'
  if (startsWithBytes(bytes, JPEG_SIGNATURE)) return 'jpeg'
  if (starts(bytes, 0, 'RIFF') && starts(bytes, 8, 'WEBP')) return 'webp'

  const brand = brandOf(bytes)
  if (brand !== null && AVIF_BRANDS.has(brand)) return 'avif'
  return null
}

/**
 * A human name for bytes the pipeline refused. Never echoes the bytes back: an
 * error message is a place a payload can travel to.
 */
export function describeContainer(bytes: Uint8Array): string {
  if (bytes.length === 0) return 'an empty file'
  if (starts(bytes, 0, 'GIF8')) return 'a GIF'
  if (starts(bytes, 0, 'BM')) return 'a BMP'
  if (startsWithBytes(bytes, [0x49, 0x49, 0x2a, 0x00])) return 'a TIFF'
  if (startsWithBytes(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return 'a TIFF'
  if (starts(bytes, 0, '<svg') || starts(bytes, 0, '<?xml')) return 'an SVG'
  if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46])) return 'a PDF'

  const brand = brandOf(bytes)
  if (brand !== null && HEIF_BRANDS.has(brand)) return 'a HEIF image'
  if (brand !== null) return `an ISO media file (brand "${brand}")`

  return 'not a recognised image'
}
