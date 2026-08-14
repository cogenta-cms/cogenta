import { describeContainer, sniffImageFormat } from '@cogenta/core'
import type { ImageFormat } from './types.js'

/**
 * Container sniffing itself now lives in `@cogenta/core` — the media upload
 * route (`@cogenta/api`) needs the exact same magic-byte sniff, and depending
 * on this package for four byte-signature checks would pull in Astro/sharp
 * for no reason. This file re-exports it so the pipeline's own call sites
 * are unchanged, and keeps the output-format concerns (MIME type, file
 * suffix) that only the pipeline needs.
 *
 * `SniffedImageFormat` (core) and `ImageFormat` (here) are the same literal
 * union by construction; re-exporting keeps one canonical implementation
 * without forcing every caller through the same type alias.
 */
export { describeContainer, sniffImageFormat }

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
