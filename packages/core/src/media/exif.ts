/**
 * A minimal, zero-dependency EXIF reader and GPS scrubber for JPEG originals
 * (fiche 11 task 6).
 *
 * Only what the media library's detail screen and its privacy notice need:
 * camera make/model, the date a photo was taken, its stored orientation, and
 * whether it carries GPS coordinates — never the full EXIF tag set. R9/R10
 * both apply here exactly as they did to `document.extract_text` (L19 task
 * 1): a JPEG's EXIF block is a TIFF structure with a documented, stable
 * layout, small enough to walk by hand without a dependency that would pull
 * in a general-purpose (and much larger) metadata library for four tags.
 *
 * **Why GPS gets stripped, not just hidden.** `docs/lots/11-mediatheque.md`
 * calls out EXIF GPS coordinates as personal data a public image can leak.
 * Unlinking the `GPSInfo` pointer from IFD0 is what every EXIF-aware reader
 * actually follows, but leaves the original bytes recoverable by anyone
 * scanning the file directly — so `stripGpsFromJpeg` also zeroes the GPS
 * IFD's own entries and any external data block a `RATIONAL` value pointed
 * at (latitude/longitude do not fit in the 4 inline bytes of a directory
 * entry, so they live elsewhere in the same TIFF blob).
 */

export interface ExifGps {
  readonly latitude: number
  readonly longitude: number
}

export interface ExifData {
  readonly make: string | null
  readonly model: string | null
  /** ISO 8601, from `DateTimeOriginal` (Exif sub-IFD) or `DateTime` (IFD0), in that order. */
  readonly takenAt: string | null
  /** The raw EXIF orientation value (1–8), or null when absent. */
  readonly orientation: number | null
  readonly gps: ExifGps | null
}

const JPEG_SOI = 0xffd8
const APP1_MARKER = 0xffe1
const EXIF_HEADER = 'Exif\0\0'

const TAG_MAKE = 0x010f
const TAG_MODEL = 0x0110
const TAG_ORIENTATION = 0x0112
const TAG_DATETIME = 0x0132
const TAG_EXIF_IFD = 0x8769
const TAG_GPS_IFD = 0x8825
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_GPS_LAT_REF = 0x0001
const TAG_GPS_LAT = 0x0002
const TAG_GPS_LON_REF = 0x0003
const TAG_GPS_LON = 0x0004

/** Bytes one value of this TIFF type occupies. Types this reader never emits (7, 11, 12) are included only so a stray tag does not miscompute an offset. */
const TYPE_SIZE: Readonly<Record<number, number>> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
}

interface TiffEntry {
  readonly tag: number
  readonly type: number
  readonly count: number
  /** Offset, from the start of the entry, of its 4-byte value/offset field. */
  readonly valueFieldOffset: number
}

/** Where the TIFF header (and so every IFD offset) starts inside the whole file. */
interface Tiff {
  readonly view: DataView
  readonly little: boolean
  readonly base: number
}

/** Finds the first APP1/Exif segment, or null when this is not a JPEG or carries none. */
function findExifTiff(bytes: Uint8Array): Tiff | null {
  if (bytes.length < 4) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(0) !== JPEG_SOI) return null

  let offset = 2
  while (offset + 4 <= bytes.length) {
    const marker = view.getUint16(offset)
    // Anything outside 0xFFE0–0xFFEF/0xFFFE is past the metadata segments a
    // JPEG puts before its image data — SOS (0xFFDA) above all — so there is
    // nothing further to find.
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) return null

    const length = view.getUint16(offset + 2)
    if (marker === APP1_MARKER && offset + 4 + 6 <= bytes.length) {
      const header = Buffer.from(bytes.slice(offset + 4, offset + 4 + 6)).toString('latin1')
      if (header === EXIF_HEADER) {
        const tiffStart = offset + 4 + 6
        if (tiffStart + 8 > bytes.length) return null
        const byteOrder = view.getUint16(tiffStart)
        if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null
        return { view, little: byteOrder === 0x4949, base: tiffStart }
      }
    }
    offset += 2 + length
  }
  return null
}

function readIfdEntries(tiff: Tiff, ifdOffset: number): readonly TiffEntry[] {
  const { view, little, base } = tiff
  const absolute = base + ifdOffset
  if (absolute + 2 > view.byteLength) return []
  const count = view.getUint16(absolute, little)
  const entries: TiffEntry[] = []
  for (let index = 0; index < count; index += 1) {
    const entryOffset = absolute + 2 + index * 12
    if (entryOffset + 12 > view.byteLength) break
    entries.push({
      tag: view.getUint16(entryOffset, little),
      type: view.getUint16(entryOffset + 2, little),
      count: view.getUint32(entryOffset + 4, little),
      valueFieldOffset: entryOffset + 8,
    })
  }
  return entries
}

/** The byte offset (relative to the TIFF base) an entry's data actually lives at — inline for ≤4 bytes, elsewhere in the blob otherwise. */
function dataOffsetOf(tiff: Tiff, entry: TiffEntry): number {
  const size = (TYPE_SIZE[entry.type] ?? 1) * entry.count
  return size > 4
    ? tiff.view.getUint32(entry.valueFieldOffset, tiff.little)
    : entry.valueFieldOffset - tiff.base
}

function readAscii(tiff: Tiff, entry: TiffEntry): string | null {
  if (entry.type !== 2 || entry.count === 0) return null
  const start = tiff.base + dataOffsetOf(tiff, entry)
  if (start + entry.count > tiff.view.byteLength) return null
  const bytes = new Uint8Array(tiff.view.buffer, tiff.view.byteOffset + start, entry.count)
  // EXIF ASCII fields are NUL-terminated; trailing NULs (and anything after
  // a stray embedded one) are not part of the human string.
  const nul = bytes.indexOf(0)
  return Buffer.from(bytes.slice(0, nul === -1 ? bytes.length : nul)).toString('latin1')
}

function readShort(tiff: Tiff, entry: TiffEntry): number | null {
  if (entry.type !== 3) return null
  return tiff.view.getUint16(entry.valueFieldOffset, tiff.little)
}

/**
 * A single `LONG` value, read directly out of the entry's inline 4-byte
 * field — never through `dataOffsetOf`, which answers "where does this
 * entry's *byte sequence* live" (inline or external) and is right for text
 * and rational arrays. A lone `LONG` always fits in those same 4 bytes, but
 * its *value* is the thing itself (a sub-IFD pointer, for both tags this
 * reader ever looks at one for), not a byte sequence to locate and read.
 */
function readLong(tiff: Tiff, entry: TiffEntry): number | null {
  if (entry.type !== 4 || entry.count !== 1) return null
  return tiff.view.getUint32(entry.valueFieldOffset, tiff.little)
}

function readRational(tiff: Tiff, offset: number): number {
  const numerator = tiff.view.getUint32(offset, tiff.little)
  const denominator = tiff.view.getUint32(offset + 4, tiff.little)
  return denominator === 0 ? 0 : numerator / denominator
}

/** Degrees/minutes/seconds, as three `RATIONAL`s, to a signed decimal degree. */
function readGpsCoordinate(tiff: Tiff, entry: TiffEntry, negative: boolean): number | null {
  if (entry.type !== 5 || entry.count !== 3) return null
  const start = tiff.base + dataOffsetOf(tiff, entry)
  if (start + 24 > tiff.view.byteLength) return null
  const degrees = readRational(tiff, start)
  const minutes = readRational(tiff, start + 8)
  const seconds = readRational(tiff, start + 16)
  const value = degrees + minutes / 60 + seconds / 3600
  return negative ? -value : value
}

/** `YYYY:MM:DD HH:MM:SS` (the one timestamp format EXIF ever uses) to ISO 8601, local time — EXIF carries no time zone, so none is invented. */
function exifDateToIso(value: string): string | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u.exec(value.trim())
  if (match === null) return null
  const [, year, month, day, hour, minute, second] = match
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

export function readExif(bytes: Uint8Array): ExifData | null {
  const tiff = findExifTiff(bytes)
  if (tiff === null) return null

  const ifd0Offset = tiff.view.getUint32(tiff.base + 4, tiff.little)
  const ifd0 = readIfdEntries(tiff, ifd0Offset)

  let make: string | null = null
  let model: string | null = null
  let orientation: number | null = null
  let dateTime: string | null = null
  let exifIfdOffset: number | null = null
  let gpsIfdOffset: number | null = null

  for (const entry of ifd0) {
    if (entry.tag === TAG_MAKE) make = readAscii(tiff, entry)
    else if (entry.tag === TAG_MODEL) model = readAscii(tiff, entry)
    else if (entry.tag === TAG_ORIENTATION) orientation = readShort(tiff, entry)
    else if (entry.tag === TAG_DATETIME) dateTime = readAscii(tiff, entry)
    else if (entry.tag === TAG_EXIF_IFD) exifIfdOffset = readLong(tiff, entry)
    else if (entry.tag === TAG_GPS_IFD) gpsIfdOffset = readLong(tiff, entry)
  }

  let takenAt: string | null = null
  if (exifIfdOffset !== null) {
    for (const entry of readIfdEntries(tiff, exifIfdOffset)) {
      if (entry.tag === TAG_DATETIME_ORIGINAL) {
        const raw = readAscii(tiff, entry)
        if (raw !== null) takenAt = exifDateToIso(raw)
      }
    }
  }
  if (takenAt === null && dateTime !== null) takenAt = exifDateToIso(dateTime)

  let gps: ExifGps | null = null
  if (gpsIfdOffset !== null) {
    const gpsEntries = readIfdEntries(tiff, gpsIfdOffset)
    let latRef: string | null = null
    let lonRef: string | null = null
    let latEntry: TiffEntry | null = null
    let lonEntry: TiffEntry | null = null
    for (const entry of gpsEntries) {
      if (entry.tag === TAG_GPS_LAT_REF) latRef = readAscii(tiff, entry)
      else if (entry.tag === TAG_GPS_LON_REF) lonRef = readAscii(tiff, entry)
      else if (entry.tag === TAG_GPS_LAT) latEntry = entry
      else if (entry.tag === TAG_GPS_LON) lonEntry = entry
    }
    if (latEntry !== null && lonEntry !== null) {
      const latitude = readGpsCoordinate(tiff, latEntry, latRef === 'S')
      const longitude = readGpsCoordinate(tiff, lonEntry, lonRef === 'W')
      if (latitude !== null && longitude !== null) gps = { latitude, longitude }
    }
  }

  if (make === null && model === null && takenAt === null && orientation === null && gps === null) {
    return null
  }
  return { make, model, takenAt, orientation, gps }
}

/**
 * Removes GPS coordinates from a JPEG's EXIF block, in place semantics
 * aside: returns a new buffer, the original is never mutated.
 *
 * Every other EXIF tag (camera, orientation, capture date) is left exactly
 * as it was — this is a location scrub, not a metadata wipe.
 */
export function stripGpsFromJpeg(bytes: Uint8Array): Uint8Array {
  const tiff = findExifTiff(bytes)
  if (tiff === null) return bytes

  const ifd0Offset = tiff.view.getUint32(tiff.base + 4, tiff.little)
  const ifd0Absolute = tiff.base + ifd0Offset
  const entryCount = tiff.view.getUint16(ifd0Absolute, tiff.little)

  let gpsEntryAbsolute: number | null = null
  let gpsIfdOffset: number | null = null
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifd0Absolute + 2 + index * 12
    if (tiff.view.getUint16(entryOffset, tiff.little) === TAG_GPS_IFD) {
      gpsEntryAbsolute = entryOffset
      gpsIfdOffset = tiff.view.getUint32(entryOffset + 8, tiff.little)
      break
    }
  }
  if (gpsEntryAbsolute === null || gpsIfdOffset === null) return bytes

  const out = Buffer.from(bytes)
  const zero = (start: number, length: number): void => {
    out.fill(0, start, Math.min(start + length, out.length))
  }

  // Unlink the pointer: tag id 0x0000 is not a defined EXIF/TIFF tag, so a
  // compliant reader treats the entry as unrecognised and never follows its
  // (now meaningless) offset into the GPS IFD. Zero is the same two bytes in
  // either byte order, so no endianness branch is needed here.
  zero(gpsEntryAbsolute, 2)

  // Zero the GPS IFD's own directory (count + entries + "next IFD" pointer)
  // and every external data block a `RATIONAL` (or otherwise >4-byte) GPS
  // entry pointed at — the coordinates themselves live there, not inline.
  const gpsIfdAbsolute = tiff.base + gpsIfdOffset
  const gpsCount = tiff.view.getUint16(gpsIfdAbsolute, tiff.little)
  for (let index = 0; index < gpsCount; index += 1) {
    const entryOffset = gpsIfdAbsolute + 2 + index * 12
    const type = tiff.view.getUint16(entryOffset + 2, tiff.little)
    const count = tiff.view.getUint32(entryOffset + 4, tiff.little)
    const size = (TYPE_SIZE[type] ?? 1) * count
    if (size > 4) {
      const dataOffset = tiff.base + tiff.view.getUint32(entryOffset + 8, tiff.little)
      zero(dataOffset, size)
    }
  }
  zero(gpsIfdAbsolute, 2 + gpsCount * 12 + 4)

  return out
}

/** Whether a JPEG's EXIF block carries GPS coordinates — the yes/no a privacy notice needs, without the caller having to unpack the whole `ExifData` shape. */
export function hasGpsData(bytes: Uint8Array): boolean {
  const exif = readExif(bytes)
  return exif !== null && exif.gps !== null
}
