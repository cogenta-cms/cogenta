import { inflateRawSync } from 'node:zlib'
import { CogentaError } from '@cogenta/core'

/**
 * The three-hundred-line half of the ZIP format a `.docx` actually uses:
 * locate the end-of-central-directory record, walk the central directory,
 * and inflate one named entry.
 *
 * R9/R10 — written here rather than pulled in: every maintained Node
 * unzip library (`yauzl`, `adm-zip`, `unzipper`, `jszip`) is either
 * callback-era, unmaintained, or an order of magnitude larger than the
 * ~120 lines a `.docx` needs, and Node already ships the only hard part
 * (`node:zlib`'s raw inflate). A `.docx` is always a stored or deflated
 * ZIP with a real central directory — no encryption, no spanning, no
 * ZIP64 unless the document is over 4 GB, which the size cap in
 * `extract-text.ts` rejects long before this code is reached.
 */

const EOCD_SIGNATURE = 0x0605_4b50
const CENTRAL_SIGNATURE = 0x0201_4b50
const LOCAL_SIGNATURE = 0x0403_4b50
const EOCD_MIN_SIZE = 22
/** The comment field is the only variable-length tail; 64 KiB is its maximum. */
const EOCD_MAX_SEARCH = EOCD_MIN_SIZE + 0xffff

/** Refuses a decompression bomb: 200 MiB out of a document we already capped on the way in. */
const MAX_INFLATED_BYTES = 200 * 1024 * 1024

function corrupt(reason: string): CogentaError {
  return new CogentaError({
    code: 'DOCUMENT_EXTRACTION_FAILED',
    message: `This file is not a readable ZIP archive: ${reason}.`,
    hint: 'A .docx is a ZIP container. Re-save the document from your word processor, or upload it as Markdown or plain text instead.',
  })
}

interface CentralEntry {
  readonly name: string
  readonly compression: number
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly localHeaderOffset: number
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const from = Math.max(0, buffer.length - EOCD_MAX_SEARCH)
  for (let at = buffer.length - EOCD_MIN_SIZE; at >= from; at--) {
    if (buffer.readUInt32LE(at) === EOCD_SIGNATURE) return at
  }
  throw corrupt('no end-of-central-directory record was found')
}

function readCentralDirectory(buffer: Buffer): readonly CentralEntry[] {
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const directoryOffset = buffer.readUInt32LE(eocd + 16)
  if (directoryOffset >= buffer.length) throw corrupt('the central directory starts past the file')

  const entries: CentralEntry[] = []
  let at = directoryOffset
  for (let index = 0; index < entryCount; index++) {
    if (at + 46 > buffer.length) throw corrupt('a central directory entry is truncated')
    if (buffer.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
      throw corrupt(`central directory entry ${index} has a bad signature`)
    }
    const nameLength = buffer.readUInt16LE(at + 28)
    const extraLength = buffer.readUInt16LE(at + 30)
    const commentLength = buffer.readUInt16LE(at + 32)
    entries.push({
      name: buffer.toString('utf8', at + 46, at + 46 + nameLength),
      compression: buffer.readUInt16LE(at + 10),
      compressedSize: buffer.readUInt32LE(at + 20),
      uncompressedSize: buffer.readUInt32LE(at + 24),
      localHeaderOffset: buffer.readUInt32LE(at + 42),
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readEntryData(buffer: Buffer, entry: CentralEntry, maxBytes: number): Buffer {
  const at = entry.localHeaderOffset
  if (at + 30 > buffer.length) throw corrupt(`the local header of "${entry.name}" is truncated`)
  if (buffer.readUInt32LE(at) !== LOCAL_SIGNATURE) {
    throw corrupt(`the local header of "${entry.name}" has a bad signature`)
  }
  const nameLength = buffer.readUInt16LE(at + 26)
  const extraLength = buffer.readUInt16LE(at + 28)
  const start = at + 30 + nameLength + extraLength
  const end = start + entry.compressedSize
  if (end > buffer.length) throw corrupt(`the data of "${entry.name}" is truncated`)
  if (entry.uncompressedSize > maxBytes) {
    throw new CogentaError({
      code: 'DOCUMENT_TOO_LARGE',
      message: `"${entry.name}" expands to ${entry.uncompressedSize} bytes, over the ${maxBytes}-byte limit.`,
      hint: 'Upload a smaller document, or paste the relevant sections as plain text.',
      details: { entry: entry.name, uncompressedSize: entry.uncompressedSize },
    })
  }

  const raw = buffer.subarray(start, end)
  if (entry.compression === 0) return raw
  if (entry.compression !== 8) {
    throw corrupt(`"${entry.name}" uses unsupported compression method ${entry.compression}`)
  }
  try {
    return inflateRawSync(raw, { maxOutputLength: maxBytes })
  } catch (error) {
    throw corrupt(
      `"${entry.name}" could not be inflated: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export interface ZipArchive {
  /** Entry names, in central-directory order. */
  readonly names: readonly string[]
  /**
   * `undefined` when the archive has no such entry — a missing part is a
   * caller's decision, not an error here.
   *
   * `maxBytes` overrides the default 200 MiB decompression-bomb cap
   * (`MAX_INFLATED_BYTES`) for this one read. A caller that knows it is
   * about to run an expensive parse over the result — a regular expression
   * or hand-written scanner over XML, say — should pass a much smaller
   * number: the bomb cap alone only bounds memory, not the CPU cost of
   * whatever runs on the inflated bytes afterwards.
   */
  read(name: string, maxBytes?: number): Buffer | undefined
}

export function openZip(buffer: Buffer): ZipArchive {
  const entries = readCentralDirectory(buffer)
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  return {
    names: entries.map((entry) => entry.name),
    read(name, maxBytes = MAX_INFLATED_BYTES) {
      const entry = byName.get(name)
      return entry === undefined ? undefined : readEntryData(buffer, entry, maxBytes)
    },
  }
}
