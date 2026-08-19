import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  extractBoundary,
  isMultipartFormData,
  parseMultipartFormData,
} from '../../src/rest/multipart.js'

const BOUNDARY = '----cogentaTestBoundary123'

function part(headers: string, body: Buffer | string): Buffer {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\n${headers}\r\n\r\n`, 'utf8'),
    typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
    Buffer.from('\r\n', 'utf8'),
  ])
}

function multipartBody(parts: readonly Buffer[]): Buffer {
  return Buffer.concat([...parts, Buffer.from(`--${BOUNDARY}--\r\n`, 'utf8')])
}

const CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`

describe('extractBoundary', () => {
  it('reads an unquoted boundary', () => {
    expect(extractBoundary('multipart/form-data; boundary=abc123')).toBe('abc123')
  })

  it('reads a quoted boundary', () => {
    expect(extractBoundary('multipart/form-data; boundary="abc 123"')).toBe('abc 123')
  })

  it('returns null when there is no boundary parameter', () => {
    expect(extractBoundary('multipart/form-data')).toBeNull()
    expect(extractBoundary('application/json')).toBeNull()
  })
})

describe('parseMultipartFormData', () => {
  it('reads a plain text field', () => {
    const body = multipartBody([
      part('Content-Disposition: form-data; name="alt"', 'A red bicycle'),
    ])
    const result = parseMultipartFormData(body, CONTENT_TYPE)
    expect(result.fields).toEqual({ alt: 'A red bicycle' })
    expect(result.files).toEqual([])
  })

  it('reads a binary file part with its own content type, byte for byte', () => {
    // Deliberately includes bytes that would break a naive string-based
    // parser: a NUL, and a byte sequence that looks like `\r\n` mid-stream.
    const fileBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0xff, 0x01])
    const body = multipartBody([
      part(
        'Content-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png',
        fileBytes,
      ),
    ])

    const result = parseMultipartFormData(body, CONTENT_TYPE)
    expect(result.files).toHaveLength(1)
    const file = result.files[0]
    expect(file?.fieldName).toBe('file')
    expect(file?.filename).toBe('photo.png')
    expect(file?.mimeType).toBe('image/png')
    expect(Buffer.from(file?.data ?? [])).toEqual(fileBytes)
  })

  it('reads multiple fields and a file together, in one request', () => {
    const fileBytes = Buffer.from('fake-image-bytes')
    const body = multipartBody([
      part('Content-Disposition: form-data; name="kind"', 'image'),
      part('Content-Disposition: form-data; name="decorative"', 'false'),
      part(
        'Content-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg',
        fileBytes,
      ),
    ])

    const result = parseMultipartFormData(body, CONTENT_TYPE)
    expect(result.fields).toEqual({ kind: 'image', decorative: 'false' })
    expect(result.files).toHaveLength(1)
    expect(Buffer.from(result.files[0]?.data ?? [])).toEqual(fileBytes)
  })

  it('decodes a UTF-8 field value correctly', () => {
    const body = multipartBody([
      part('Content-Disposition: form-data; name="alt"', 'Un vélo rouge à côté d’un café'),
    ])
    const result = parseMultipartFormData(body, CONTENT_TYPE)
    expect(result.fields['alt']).toBe('Un vélo rouge à côté d’un café')
  })

  it('handles an escaped quote inside a filename', () => {
    const body = multipartBody([
      part(
        'Content-Disposition: form-data; name="file"; filename="quote \\"here\\".jpg"\r\nContent-Type: image/jpeg',
        Buffer.from('x'),
      ),
    ])
    const result = parseMultipartFormData(body, CONTENT_TYPE)
    expect(result.files[0]?.filename).toBe('quote "here".jpg')
  })

  it('refuses a body whose Content-Type names no boundary', () => {
    const error = catchError(() =>
      parseMultipartFormData(Buffer.from('irrelevant'), 'multipart/form-data'),
    )
    expect(isCogentaError(error) && error.code).toBe('MEDIA_INVALID')
  })

  it('refuses a body that never actually contains the declared boundary', () => {
    const error = catchError(() =>
      parseMultipartFormData(Buffer.from('nothing here'), CONTENT_TYPE),
    )
    expect(isCogentaError(error) && error.code).toBe('MEDIA_INVALID')
  })
})

describe('isMultipartFormData', () => {
  it('recognises a parsed multipart body', () => {
    expect(isMultipartFormData({ fields: {}, files: [] })).toBe(true)
  })

  it('does not mistake the legacy base64 JSON upload body for one', () => {
    expect(
      isMultipartFormData({ kind: 'image', filename: 'a.png', mimeType: 'image/png', data: 'x' }),
    ).toBe(false)
  })

  it('rejects primitives and null', () => {
    expect(isMultipartFormData(null)).toBe(false)
    expect(isMultipartFormData('a string')).toBe(false)
    expect(isMultipartFormData(42)).toBe(false)
  })
})

function catchError(run: () => unknown): unknown {
  try {
    run()
    return null
  } catch (error) {
    return error
  }
}
