import { describe, expect, it } from 'vitest'
import {
  assertAllowedFormFile,
  DEFAULT_FORM_FILE_MAX_BYTES,
  FORM_FILE_HARD_MAX_BYTES,
  sniffFormFileCategory,
} from '../src/file-field.js'
import type { FormFieldDefinition } from '../src/types.js'

/**
 * Fiche 47 task 3's own security requirement, verified with real byte
 * signatures (never a filename or a declared `Content-Type`) — this is the
 * one test the tasking calls out explicitly: "champ `file` refuse un
 * fichier dont les octets contredisent l'extension".
 */

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n')
const ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00])
const PLAIN_TEXT_BYTES = Buffer.from(
  'Dear team,\n\nPlease find my request below.\n\nBest regards,\nA visitor.',
)
// An ELF binary header — a real executable's magic bytes, not a text/image/pdf/zip signature.
const ELF_BYTES = Buffer.from([
  0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x02, 0x00, 0x3e, 0x00,
])

function fileField(overrides: Partial<FormFieldDefinition> = {}): FormFieldDefinition {
  return { name: 'attachment', label: 'Attachment', kind: 'file', required: true, ...overrides }
}

describe('sniffFormFileCategory — reads the bytes, never a filename or declared type', () => {
  it('recognises a real image by its magic bytes', () => {
    expect(sniffFormFileCategory(PNG_BYTES)).toBe('image')
  })

  it('recognises a real PDF by its magic bytes', () => {
    expect(sniffFormFileCategory(PDF_BYTES)).toBe('pdf')
  })

  it('recognises a ZIP-based document container (docx/xlsx/pptx/odt)', () => {
    expect(sniffFormFileCategory(ZIP_BYTES)).toBe('document')
  })

  it('recognises plain text with no NUL bytes and mostly printable content', () => {
    expect(sniffFormFileCategory(PLAIN_TEXT_BYTES)).toBe('text')
  })

  it('does not recognise an executable or random binary noise as a supported category', () => {
    expect(sniffFormFileCategory(ELF_BYTES)).toBeNull()
  })
})

describe('assertAllowedFormFile — the real defence a public, anonymous upload route needs', () => {
  it('accepts a real PDF whose declared extension also says PDF', () => {
    expect(assertAllowedFormFile(fileField(), PDF_BYTES)).toBe('pdf')
  })

  it('rejects an executable renamed with a document-looking extension: the extension lied, the bytes did not', () => {
    // The field name/filename would claim "report.docx" in a real request,
    // but only the bytes ever reach this function — an ELF binary is
    // refused outright, regardless of what it was called.
    expect(() => assertAllowedFormFile(fileField(), ELF_BYTES)).toThrow(
      expect.objectContaining({ code: 'FORM_FILE_REJECTED' }),
    )
  })

  it('rejects a real file of a category this field does not accept', () => {
    const imageOnly = fileField({ acceptCategories: ['image'] })
    expect(() => assertAllowedFormFile(imageOnly, PDF_BYTES)).toThrow(
      expect.objectContaining({ code: 'FORM_FILE_REJECTED' }),
    )
    // The same bytes, declared as an image-accepting field, are fine.
    expect(assertAllowedFormFile(fileField({ acceptCategories: ['image'] }), PNG_BYTES)).toBe(
      'image',
    )
  })

  it('rejects an empty upload', () => {
    expect(() => assertAllowedFormFile(fileField(), Buffer.alloc(0))).toThrow(
      expect.objectContaining({ code: 'FORM_FILE_REJECTED' }),
    )
  })

  it('rejects a file larger than the field-configured maximum', () => {
    const small = fileField({ maxSizeBytes: 10 })
    expect(() => assertAllowedFormFile(small, PLAIN_TEXT_BYTES)).toThrow(
      expect.objectContaining({ code: 'FORM_FILE_REJECTED' }),
    )
  })

  it('never honours a field-configured maximum above the hard ceiling', () => {
    const oversized = fileField({ maxSizeBytes: FORM_FILE_HARD_MAX_BYTES * 10 })
    const justOverHardCap = Buffer.concat([
      PLAIN_TEXT_BYTES,
      Buffer.alloc(FORM_FILE_HARD_MAX_BYTES, 0x41),
    ])
    expect(() => assertAllowedFormFile(oversized, justOverHardCap)).toThrow(
      expect.objectContaining({ code: 'FORM_FILE_REJECTED' }),
    )
  })

  it('the default maximum is sane and below the hard ceiling', () => {
    expect(DEFAULT_FORM_FILE_MAX_BYTES).toBeLessThanOrEqual(FORM_FILE_HARD_MAX_BYTES)
  })
})
