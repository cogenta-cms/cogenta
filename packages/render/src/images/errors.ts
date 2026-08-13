import { CogentaError } from '@cogenta/core'
import { describeContainer } from './format.js'

/**
 * Every failure the pipeline can produce, in one place.
 *
 * Both tiers raise the *same* error for the same cause, because a caller that
 * branches on `code` must not have to know which tier is installed. libvips
 * reports a decode failure as a WebAssembly exception in one tier and as a
 * plain `Error` in the other; neither shape reaches the caller.
 *
 * There is no `IMAGE_*` entry in `ERROR_CODES` yet — adding one means touching
 * `@cogenta/core`, which is a separate change — so these reuse the existing
 * codes with the meanings they already carry: the input is at fault
 * (`CONTENT_INVALID`), or the pipeline is (`INTERNAL`).
 */

export function unsupportedFormatError(bytes: Uint8Array, mediaId: string): CogentaError {
  return new CogentaError({
    code: 'CONTENT_INVALID',
    message: `The media ${mediaId} is ${describeContainer(bytes)}, which Cogenta cannot resize.`,
    hint: 'Upload the image as AVIF, WebP, JPEG or PNG. Animated GIFs and SVGs are served untouched instead of being resized — do not send them through ctx.image().',
    details: { media: mediaId },
  })
}

export function decodeFailedError(mediaId: string, cause: unknown): CogentaError {
  return new CogentaError({
    code: 'CONTENT_INVALID',
    message: `The media ${mediaId} announces a format Cogenta supports but could not be decoded.`,
    hint: 'The file is truncated or corrupted. Re-upload it, and check the storage driver if this happens to more than one image.',
    cause,
    details: { media: mediaId },
  })
}

export function encodeFailedError(
  mediaId: string,
  format: string,
  driver: string,
  cause: unknown,
): CogentaError {
  return new CogentaError({
    code: 'INTERNAL',
    message: `The ${driver} image driver could not encode ${mediaId} as ${format}.`,
    hint: 'Ask for a different format — every build of libvips can write JPEG, PNG and WebP, while AVIF depends on how the codec was built. `cogenta doctor` reports which driver is running.',
    cause,
    details: { media: mediaId, format, driver },
  })
}

export function invalidOptionError(
  message: string,
  details: Record<string, unknown>,
): CogentaError {
  return new CogentaError({
    code: 'CONTENT_INVALID',
    message,
    hint: 'Fix the arguments passed to ctx.image(), or the query string of the /_image request that produced them.',
    details,
  })
}

export function missingSizeError(mediaId: string): CogentaError {
  return new CogentaError({
    code: 'CONTENT_INVALID',
    message: `The media ${mediaId} has no intrinsic size, and none was asked for.`,
    hint: 'Pass width and height to ctx.image(), or re-scan the media so that its size is stored. A size is required: an image without one shifts the layout while it loads.',
    details: { media: mediaId },
  })
}
