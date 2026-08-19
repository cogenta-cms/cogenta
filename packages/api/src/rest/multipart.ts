import { CogentaError } from '@cogenta/core'

/**
 * A hand-rolled `multipart/form-data` parser (fiche 11 task 1).
 *
 * Zero dependency (R9): the format is a documented, stable wire shape
 * (RFC 7578) with one real subtlety — a part's body is arbitrary binary, so
 * it must never be decoded to a JS string before the boundary has located
 * its exact byte range. Everything here works on `Buffer` offsets for that
 * reason; only the small, always-ASCII-ish header block of each part is
 * ever turned into text.
 *
 * This is what lets `/api/media` accept a real binary upload without the
 * ~33% base64 inflation the JSON path pays (`media-router.ts`'s own
 * long-standing note about why it used to be the only option) and without a
 * multipart-parsing dependency pulling a second HTTP-body model into a
 * transport that otherwise never sees a raw body (`http.ts`).
 */

export interface MultipartFile {
  readonly fieldName: string
  readonly filename: string
  readonly mimeType: string
  readonly data: Uint8Array
}

export interface MultipartFormData {
  readonly fields: Readonly<Record<string, string>>
  readonly files: readonly MultipartFile[]
}

/**
 * Structural, not nominal: the legacy JSON upload body (`{ kind, filename,
 * mimeType, data, ... }`) never carries a `files` array, so this cannot
 * mistake one for the other.
 */
export function isMultipartFormData(value: unknown): value is MultipartFormData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fields' in value &&
    'files' in value &&
    Array.isArray((value as { files: unknown }).files)
  )
}

function invalidMultipart(message: string): CogentaError {
  return new CogentaError({
    code: 'MEDIA_INVALID',
    message,
    hint: 'Send a real multipart/form-data request — most HTTP clients and every browser build one from a FormData object automatically.',
  })
}

/** `boundary=xyz` or `boundary="xyz"`, from a `Content-Type` header. */
export function extractBoundary(contentType: string): string | null {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/iu.exec(contentType)
  const boundary = (match?.[1] ?? match?.[2] ?? '').trim()
  return boundary.length === 0 ? null : boundary
}

interface PartHeaders {
  readonly name: string | null
  /** `undefined` when the part carries no `filename` attribute at all — a plain field, not a file. */
  readonly filename: string | undefined
  readonly contentType: string | undefined
}

function parsePartHeaders(headerText: string): PartHeaders {
  let name: string | null = null
  let filename: string | undefined
  let contentType: string | undefined

  for (const line of headerText.split('\r\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (key === 'content-disposition') {
      const nameMatch = /(?:^|;)\s*name="((?:[^"\\]|\\.)*)"/u.exec(value)
      if (nameMatch?.[1] !== undefined) name = nameMatch[1].replaceAll('\\"', '"')
      const filenameMatch = /(?:^|;)\s*filename="((?:[^"\\]|\\.)*)"/u.exec(value)
      if (filenameMatch !== null) filename = (filenameMatch[1] ?? '').replaceAll('\\"', '"')
    } else if (key === 'content-type') {
      contentType = value
    }
  }

  return { name, filename, contentType }
}

const CRLFCRLF = Buffer.from('\r\n\r\n', 'latin1')
const CR = 0x0d
const LF = 0x0a
const DASH = 0x2d

export function parseMultipartFormData(body: Uint8Array, contentType: string): MultipartFormData {
  const boundary = extractBoundary(contentType)
  if (boundary === null) {
    throw invalidMultipart('The Content-Type header names no multipart boundary.')
  }

  const buffer = Buffer.isBuffer(body)
    ? body
    : Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  const delimiter = Buffer.from(`--${boundary}`, 'latin1')

  const fields: Record<string, string> = {}
  const files: MultipartFile[] = []

  let cursor = buffer.indexOf(delimiter)
  if (cursor === -1) {
    throw invalidMultipart('No part of the body starts with the declared boundary.')
  }

  while (cursor !== -1) {
    let partStart = cursor + delimiter.length
    // The closing boundary is "--<boundary>--": nothing follows it.
    if (buffer[partStart] === DASH && buffer[partStart + 1] === DASH) break
    if (buffer[partStart] === CR && buffer[partStart + 1] === LF) partStart += 2

    const headerEnd = buffer.indexOf(CRLFCRLF, partStart)
    const nextBoundary = buffer.indexOf(delimiter, partStart)
    if (headerEnd === -1 || nextBoundary === -1 || headerEnd > nextBoundary) break

    const headerText = buffer.toString('utf8', partStart, headerEnd)
    const bodyStart = headerEnd + CRLFCRLF.length
    let bodyEnd = nextBoundary
    if (buffer[bodyEnd - 1] === LF && buffer[bodyEnd - 2] === CR) bodyEnd -= 2

    const headers = parsePartHeaders(headerText)
    if (headers.name !== null) {
      if (headers.filename !== undefined) {
        files.push({
          fieldName: headers.name,
          filename: headers.filename,
          mimeType: headers.contentType ?? 'application/octet-stream',
          data: buffer.subarray(Math.max(bodyStart, 0), Math.max(bodyEnd, bodyStart)),
        })
      } else {
        fields[headers.name] = buffer.toString('utf8', bodyStart, Math.max(bodyEnd, bodyStart))
      }
    }

    cursor = nextBoundary
  }

  return { fields, files }
}
