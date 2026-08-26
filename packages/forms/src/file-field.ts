import { createHmac, timingSafeEqual } from 'node:crypto'
import { CogentaError, describeContainer, sniffImageFormat } from '@cogenta/core'
import {
  FORM_FILE_CATEGORIES,
  type FormFieldDefinition,
  type FormFileCategory,
  type FormFileValue,
  isFormFileValue,
} from './types.js'

/**
 * Fiche 47 task 3 — the `file` field's byte-level defence. Reuses the same
 * discipline as the media pipeline's `verifyRealType` (`@cogenta/api`'s
 * `media-router.ts`, L10 task 5): the category is read from the bytes,
 * *never* from a filename or a declared `Content-Type` — both are
 * attacker-controlled, and this route is reached by an anonymous visitor
 * (fiche 47's own framing: "traite ça comme une vraie surface d'attaque").
 *
 * `sniffImageFormat` itself is imported straight from `@cogenta/core`
 * (already a direct dependency) rather than duplicated; the three other
 * categories are small, zero-dependency signature checks in the same spirit
 * as `@cogenta/core`'s own `format-sniff.ts`.
 */

/** A hard ceiling regardless of what a form's own `maxSizeBytes` (or this default) says — an operator cannot accidentally turn an anonymous upload route into an unbounded disk sink. */
export const FORM_FILE_HARD_MAX_BYTES = 25 * 1024 * 1024
export const DEFAULT_FORM_FILE_MAX_BYTES = 10 * 1024 * 1024

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46] // "%PDF"
// A ZIP local-file-header — what a .docx/.xlsx/.pptx/.odt *is*: an office
// document is never distinguished further than "a ZIP archive with the
// shape Office/OpenDocument containers share" — enough to refuse a renamed
// executable without pretending to fully parse the container.
const ZIP_SIGNATURES: readonly (readonly number[])[] = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
]

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

/**
 * A conservative "this looks like text a human wrote" heuristic: no NUL byte
 * (binary formats almost always have one in their first kilobyte) and at
 * least 95% of the sampled bytes are printable ASCII, a tab, or part of a
 * line ending. Not a real encoding detector — it does not need to be one, it
 * only needs to keep out disguised binaries, and a `text`-category field is
 * never executed or served as anything but a downloadable attachment.
 */
function looksLikePlainText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096))
  let printable = 0
  for (const byte of sample) {
    if (byte === 0x00) return false
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      printable += 1
      continue
    }
    if (byte >= 0x20 && byte <= 0x7e) {
      printable += 1
      continue
    }
    // Allow UTF-8 continuation/lead bytes (accented text, BOM) without
    // counting them against the printable ratio — but do not count them
    // *for* it either, since a genuinely binary file can also contain runs
    // of high bytes.
    if (byte >= 0xc0) continue
  }
  return printable / sample.length >= 0.95
}

/** The category these bytes actually are, or `null` when nothing this route accepts recognises them. */
export function sniffFormFileCategory(bytes: Uint8Array): FormFileCategory | null {
  if (sniffImageFormat(bytes) !== null) return 'image'
  if (startsWithBytes(bytes, PDF_SIGNATURE)) return 'pdf'
  if (ZIP_SIGNATURES.some((signature) => startsWithBytes(bytes, signature))) return 'document'
  if (looksLikePlainText(bytes)) return 'text'
  return null
}

const CONTENT_TYPE_BY_CATEGORY: Readonly<Record<FormFileCategory, string>> = {
  image: 'application/octet-stream', // refined by `sniffImageFormat`'s own format when the caller wants it; a form attachment is never inlined as `<img>`, so the generic type is enough here.
  pdf: 'application/pdf',
  document: 'application/octet-stream',
  text: 'text/plain; charset=utf-8',
}

/** The content type this category's bytes earn — never the uploader's declared `Content-Type`, same reasoning as `verifyRealType` in `media-router.ts`. */
export function contentTypeForCategory(category: FormFileCategory): string {
  return CONTENT_TYPE_BY_CATEGORY[category]
}

function rejected(field: FormFieldDefinition, reason: string): CogentaError {
  return new CogentaError({
    code: 'FORM_FILE_REJECTED',
    message: reason,
    hint: 'Upload a file whose real content matches one of the types this field accepts.',
    details: { field: field.name },
  })
}

/**
 * Throws `FORM_FILE_REJECTED` when `bytes` do not belong to a category this
 * field accepts, or exceed the size ceiling. Returns the sniffed category on
 * success — the caller (the router, which alone holds a `StorageDriver`)
 * still has to actually store the bytes.
 */
export function assertAllowedFormFile(
  field: FormFieldDefinition,
  bytes: Uint8Array,
): FormFileCategory {
  const maxBytes = Math.min(
    field.maxSizeBytes ?? DEFAULT_FORM_FILE_MAX_BYTES,
    FORM_FILE_HARD_MAX_BYTES,
  )
  if (bytes.length === 0)
    throw rejected(field, `"${field.name}" needs a real file, not an empty one.`)
  if (bytes.length > maxBytes) {
    throw rejected(
      field,
      `"${field.name}" is larger than the ${Math.floor(maxBytes / (1024 * 1024))}MB this form accepts.`,
    )
  }

  const category = sniffFormFileCategory(bytes)
  const accepted = field.acceptCategories ?? FORM_FILE_CATEGORIES
  if (category === null) {
    throw rejected(
      field,
      `"${field.name}" was sent as ${describeContainer(bytes)}, which is not a supported file type (accepted: ${accepted.join(', ')}).`,
    )
  }
  if (!accepted.includes(category)) {
    throw rejected(
      field,
      `"${field.name}" was sent as a ${category} file, which this field does not accept (accepted: ${accepted.join(', ')}).`,
    )
  }
  return category
}

/**
 * A `FormFileValue` carried forward across a multi-step form's pages
 * (`_accumulated`) is client-supplied text like everything else in that
 * blob — a security review of this exact file field found that trusting its
 * *shape* alone (`isFormFileValue`) let an anonymous visitor hand-craft one,
 * claiming any `storageKey` exists, without ever uploading a real byte.
 * Signing with the site's own derived secret (never a value stored
 * anywhere else, never re-derivable by a client — `@cogenta/cli`'s
 * `serve.ts` derives it from `COGENTA_AUTH_SIGNING_KEY`, the same "derived,
 * never a second secret" discipline `commentsIpHashSecret` already
 * follows) is what turns "a client can carry this forward" into "a client
 * cannot forge or edit this": the router's own `resolveFileFields` never
 * accepts a raw carried-forward object again, only a token this function
 * itself produced.
 */
export function signFormFileToken(secret: string, value: FormFileValue): string {
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

/** `null` for a missing/malformed/mis-signed token — the caller treats that exactly like the field being absent, never like a shape error worth a different message (nothing about *why* a forged token failed should be observable). */
export function verifyFormFileToken(secret: string, token: string): FormFileValue | null {
  const separator = token.lastIndexOf('.')
  if (separator === -1) return null
  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const provided = Buffer.from(signature, 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) return null

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return isFormFileValue(parsed) ? parsed : null
  } catch {
    return null
  }
}
