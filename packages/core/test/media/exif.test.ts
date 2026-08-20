import { describe, expect, it } from 'vitest'
import { hasGpsData, readExif, stripGpsFromJpeg } from '../../src/media/exif.js'

/**
 * A hand-built JPEG carrying a real APP1/Exif TIFF structure — IFD0 (Make,
 * Model, Orientation, DateTime, plus pointers to the two sub-IFDs below), an
 * Exif sub-IFD (DateTimeOriginal) and a GPS sub-IFD (lat/long as the
 * three-`RATIONAL` degrees/minutes/seconds EXIF actually uses). Built by
 * hand rather than lifted from a real photo (`build-corpus.py`'s reasoning
 * for L19's document fixtures applies just as much here): every offset in
 * this file is known, so a test that reads back "48.8566" is proof the
 * reader walks the TIFF directory correctly, not proof it read *something*.
 */

const TIFF_HEADER_SIZE = 8

interface Ifd0Entry {
  readonly tag: number
  readonly type: number
  readonly count: number
  /** Inline (≤4 bytes) or a placeholder resolved once the whole layout is known. */
  readonly inline?: Buffer | undefined
  readonly external?: Buffer | undefined
  /** True for the two sub-IFD pointer tags, patched in a second pass once the sub-IFD's own offset is known. */
  readonly pointerTo?: 'exif' | 'gps'
}

function asciiField(text: string): Buffer {
  return Buffer.from(`${text}\0`, 'latin1')
}

function rational(numerator: number, denominator: number): Buffer {
  const buffer = Buffer.alloc(8)
  buffer.writeUInt32LE(numerator, 0)
  buffer.writeUInt32LE(denominator, 4)
  return buffer
}

function degreesToDms(value: number): Buffer {
  const degrees = Math.floor(value)
  const minutesFloat = (value - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = Math.round((minutesFloat - minutes) * 60 * 1000)
  return Buffer.concat([rational(degrees, 1), rational(minutes, 1), rational(seconds, 1000)])
}

/** Writes one IFD (directory + inline/external values) at `offset`, little-endian. Returns the byte length of the directory + its own external data. */
function writeIfd(
  buffer: Buffer,
  offset: number,
  entries: readonly Ifd0Entry[],
  pointerOffsets: { exif?: number; gps?: number },
): number {
  buffer.writeUInt16LE(entries.length, offset)
  let externalCursor = offset + 2 + entries.length * 12 + 4

  const externalStarts: number[] = []
  for (const entry of entries) {
    if (entry.external !== undefined) {
      externalStarts.push(externalCursor)
      externalCursor += entry.external.length
    } else {
      externalStarts.push(-1)
    }
  }

  entries.forEach((entry, index) => {
    const entryOffset = offset + 2 + index * 12
    buffer.writeUInt16LE(entry.tag, entryOffset)
    buffer.writeUInt16LE(entry.type, entryOffset + 2)
    buffer.writeUInt32LE(entry.count, entryOffset + 4)
    if (entry.pointerTo !== undefined) {
      const target = pointerOffsets[entry.pointerTo]
      if (target === undefined) throw new Error('pointer target not laid out yet')
      buffer.writeUInt32LE(target, entryOffset + 8)
    } else if (entry.external !== undefined) {
      const start = externalStarts[index] ?? -1
      buffer.writeUInt32LE(start, entryOffset + 8)
      entry.external.copy(buffer, start)
    } else if (entry.inline !== undefined) {
      entry.inline.copy(buffer, entryOffset + 8)
    }
  })

  buffer.writeUInt32LE(0, offset + 2 + entries.length * 12) // no "next IFD"
  return externalCursor - offset
}

interface ExifFixtureOptions {
  readonly gps?: { readonly latitude: number; readonly longitude: number } | undefined
  readonly dateTimeOriginal?: string | undefined
}

function buildJpegWithExif(options: ExifFixtureOptions = {}): Buffer {
  const make = asciiField('Cogenta')
  const model = asciiField('Test Camera')
  const dateTime = asciiField('2026:01:02 03:04:05')
  const dateTimeOriginal = asciiField(options.dateTimeOriginal ?? '2026:01:02 03:04:06')

  const ifd0Entries: Ifd0Entry[] = [
    { tag: 0x010f, type: 2, count: make.length, external: make }, // Make
    { tag: 0x0110, type: 2, count: model.length, external: model }, // Model
    {
      tag: 0x0112,
      type: 3,
      count: 1,
      inline: (() => {
        const buffer = Buffer.alloc(4)
        buffer.writeUInt16LE(1, 0)
        return buffer
      })(),
    }, // Orientation = 1
    { tag: 0x0132, type: 2, count: dateTime.length, external: dateTime }, // DateTime
    { tag: 0x8769, type: 4, count: 1, pointerTo: 'exif' }, // Exif IFD pointer
    ...(options.gps === undefined
      ? []
      : [{ tag: 0x8825, type: 4, count: 1, pointerTo: 'gps' as const }]),
  ]

  const exifEntries: Ifd0Entry[] = [
    { tag: 0x9003, type: 2, count: dateTimeOriginal.length, external: dateTimeOriginal },
  ]

  const latRef = asciiField(options.gps !== undefined && options.gps.latitude < 0 ? 'S' : 'N')
  const lonRef = asciiField(options.gps !== undefined && options.gps.longitude < 0 ? 'W' : 'E')
  const latDms =
    options.gps === undefined ? Buffer.alloc(0) : degreesToDms(Math.abs(options.gps.latitude))
  const lonDms =
    options.gps === undefined ? Buffer.alloc(0) : degreesToDms(Math.abs(options.gps.longitude))

  // `latRef`/`lonRef` are always 2 bytes ("N\0", "S\0", …) — always inline,
  // never worth the external-data branch the longer fields above need.
  const gpsEntries: Ifd0Entry[] =
    options.gps === undefined
      ? []
      : [
          { tag: 0x0001, type: 2, count: latRef.length, inline: latRef },
          { tag: 0x0002, type: 5, count: 3, external: latDms },
          { tag: 0x0003, type: 2, count: lonRef.length, inline: lonRef },
          { tag: 0x0004, type: 5, count: 3, external: lonDms },
        ]

  // Generous fixed-size scratch buffer — trimmed to the real size once every
  // block has actually been written.
  const scratch = Buffer.alloc(2048)

  const ifd0Offset = TIFF_HEADER_SIZE
  const ifd0DirSize = 2 + ifd0Entries.length * 12 + 4
  const ifd0ExternalSize = ifd0Entries.reduce(
    (sum, entry) => sum + (entry.external?.length ?? 0),
    0,
  )
  const exifIfdOffset = ifd0Offset + ifd0DirSize + ifd0ExternalSize

  let gpsIfdOffset = 0
  if (options.gps !== undefined) {
    const exifDirSize = 2 + exifEntries.length * 12 + 4
    const exifExternalSize = exifEntries.reduce(
      (sum, entry) => sum + (entry.external?.length ?? 0),
      0,
    )
    gpsIfdOffset = exifIfdOffset + exifDirSize + exifExternalSize
  }

  // TIFF header: byte order 'II' (little-endian), magic 42, offset of IFD0.
  scratch.write('II', 0, 'latin1')
  scratch.writeUInt16LE(42, 2)
  scratch.writeUInt32LE(ifd0Offset, 4)

  writeIfd(scratch, ifd0Offset, ifd0Entries, { exif: exifIfdOffset, gps: gpsIfdOffset })
  const exifEnd =
    exifEntries.length === 0
      ? exifIfdOffset
      : writeIfd(scratch, exifIfdOffset, exifEntries, {}) + exifIfdOffset
  const gpsEnd =
    options.gps === undefined
      ? exifEnd
      : writeIfd(scratch, gpsIfdOffset, gpsEntries, {}) + gpsIfdOffset

  const tiffLength = Math.max(exifEnd, gpsEnd)
  const tiff = scratch.subarray(0, tiffLength)

  const app1Payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const app1Length = app1Payload.length + 2 // includes the length field itself

  const header = Buffer.alloc(4)
  header.writeUInt16BE(0xffe1, 0)
  header.writeUInt16BE(app1Length, 2)

  return Buffer.concat([Buffer.from([0xff, 0xd8]), header, app1Payload])
}

describe('readExif', () => {
  it('returns null for a JPEG with no APP1/Exif segment', () => {
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull()
  })

  it('returns null for bytes that are not a JPEG at all', () => {
    expect(readExif(new TextEncoder().encode('not a jpeg'))).toBeNull()
  })

  it('reads make, model, orientation and the capture date', () => {
    const jpeg = buildJpegWithExif()
    const exif = readExif(jpeg)
    expect(exif).not.toBeNull()
    expect(exif?.make).toBe('Cogenta')
    expect(exif?.model).toBe('Test Camera')
    expect(exif?.orientation).toBe(1)
    // DateTimeOriginal (Exif sub-IFD) wins over IFD0's DateTime.
    expect(exif?.takenAt).toBe('2026-01-02T03:04:06')
    expect(exif?.gps).toBeNull()
  })

  it('reads GPS coordinates back to real decimal degrees', () => {
    const jpeg = buildJpegWithExif({ gps: { latitude: 48.8566, longitude: 2.3522 } })
    const exif = readExif(jpeg)
    expect(exif?.gps?.latitude).toBeCloseTo(48.8566, 3)
    expect(exif?.gps?.longitude).toBeCloseTo(2.3522, 3)
  })

  it('applies the S/W hemisphere references as a sign', () => {
    const jpeg = buildJpegWithExif({ gps: { latitude: -33.8688, longitude: -151.2093 } })
    const exif = readExif(jpeg)
    expect(exif?.gps?.latitude).toBeLessThan(0)
    expect(exif?.gps?.longitude).toBeLessThan(0)
    expect(exif?.gps?.latitude).toBeCloseTo(-33.8688, 3)
  })
})

describe('hasGpsData', () => {
  it('is false without a GPS IFD and true with one', () => {
    expect(hasGpsData(buildJpegWithExif())).toBe(false)
    expect(hasGpsData(buildJpegWithExif({ gps: { latitude: 1, longitude: 2 } }))).toBe(true)
  })
})

describe('stripGpsFromJpeg', () => {
  it('removes GPS coordinates while leaving every other EXIF tag intact', () => {
    const original = buildJpegWithExif({ gps: { latitude: 48.8566, longitude: 2.3522 } })
    const stripped = stripGpsFromJpeg(original)

    const strippedExif = readExif(stripped)
    expect(strippedExif?.gps).toBeNull()
    expect(strippedExif?.make).toBe('Cogenta')
    expect(strippedExif?.model).toBe('Test Camera')
    expect(strippedExif?.takenAt).toBe('2026-01-02T03:04:06')
  })

  it('does not mutate the buffer it was given', () => {
    const original = buildJpegWithExif({ gps: { latitude: 10, longitude: 20 } })
    const copy = Buffer.from(original)
    stripGpsFromJpeg(original)
    expect(Buffer.compare(original, copy)).toBe(0)
  })

  it('leaves no recoverable coordinate bytes behind, not just an unlinked pointer', () => {
    const original = buildJpegWithExif({ gps: { latitude: 48.8566, longitude: 2.3522 } })
    const stripped = Buffer.from(stripGpsFromJpeg(original))

    // Same length: this is a scrub in place, never a resize (a resize would
    // shift every offset after the cut and corrupt the rest of the file).
    expect(stripped.length).toBe(original.length)
    // The bytes genuinely changed — a no-op "strip" that returned the input
    // untouched would also pass the assertion above and the ones in the
    // previous test, so this is the one that proves a scrub actually ran.
    expect(Buffer.compare(stripped, original)).not.toBe(0)

    // The latitude's whole-degrees `RATIONAL` (48/1, encoded as two
    // little-endian uint32s) must not appear anywhere in the output.
    const latitudeDegreesRational = Buffer.alloc(8)
    latitudeDegreesRational.writeUInt32LE(48, 0)
    latitudeDegreesRational.writeUInt32LE(1, 4)
    expect(stripped.includes(latitudeDegreesRational)).toBe(false)
  })

  it('is a no-op for a JPEG with no GPS data', () => {
    const original = buildJpegWithExif()
    const result = stripGpsFromJpeg(original)
    expect(Buffer.compare(Buffer.from(result), Buffer.from(original))).toBe(0)
  })

  it('is a no-op for a JPEG with no Exif segment at all', () => {
    const noExif = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    expect(stripGpsFromJpeg(noExif)).toBe(noExif)
  })
})
