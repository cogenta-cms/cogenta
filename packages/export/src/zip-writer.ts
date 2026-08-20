import { crc32 } from 'node:zlib'
import { CogentaError } from '@cogenta/core'

/**
 * A streaming, store-only (uncompressed) ZIP writer. Zero dependencies (R9):
 * `node:zlib` already has the one non-trivial piece a ZIP needs (`crc32`),
 * and the container format itself is a few hundred bytes of bookkeeping.
 *
 * **Store, not deflate, on purpose.** The two things this writer bundles —
 * media originals and NDJSON table dumps — are either already compressed
 * (images) or compress cheaply enough at rest that a second pass buys little
 * (`gzip -9` on a backup's NDJSON is a caller's choice, layered outside this
 * writer, never inside it). Store mode also means every entry's compressed
 * size equals its real size, known before the bytes are read — which is what
 * lets this writer emit each entry's local header, data and data descriptor
 * as they stream past, and hold nothing beyond the current entry in memory.
 *
 * A `.zip` is otherwise unremarkable: local file headers first, then a
 * central directory naming every one of them, then one end-of-central-
 * directory record. Every unzip tool reads it the same way.
 */

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
/** ZIP64 is not implemented: `@cogenta/agents`' reader does not need it either, and a backup or media archive over 4 GiB is a `docs/hebergement-mutualise.md`-scale exception, not the common case this package targets. */
const MAX_ENTRY_SIZE = 0xffffffff

interface CentralDirectoryEntry {
  readonly name: Buffer
  readonly crc32: number
  readonly size: number
  readonly offset: number
}

/** DOS date/time, fixed at the Unix epoch: content, not the archive's own timestamp, is what a Cogenta export means to preserve. */
const DOS_TIME = 0
const DOS_DATE = 0b0000000000100001 // 1980-01-01, the DOS epoch

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value, 0)
  return buffer
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value, 0)
  return buffer
}

export interface ZipWriter {
  /**
   * Streams one file into the archive. `data` may be a `Buffer` or an
   * `AsyncIterable<Buffer>` (a `Readable` satisfies this) — either way, bytes
   * are written to `sink` as they arrive rather than assembled in memory.
   */
  addFile(name: string, data: Buffer | AsyncIterable<Buffer>): Promise<void>
  /** Writes the central directory and end record. Call exactly once, last. */
  finish(): Promise<void>
}

export interface CreateZipWriterOptions {
  /** Called with each chunk of the archive, in order. */
  readonly write: (chunk: Buffer) => Promise<void> | void
}

export function createZipWriter(options: CreateZipWriterOptions): ZipWriter {
  const entries: CentralDirectoryEntry[] = []
  let offset = 0

  const write = async (chunk: Buffer): Promise<void> => {
    await options.write(chunk)
    offset += chunk.length
  }

  return {
    async addFile(name, data) {
      const nameBuffer = Buffer.from(name, 'utf8')
      const localHeaderOffset = offset

      // Store mode with a trailing data descriptor: the size and CRC are not
      // known until the last byte has streamed past, so the local header
      // declares them as zero and a descriptor after the data carries the
      // real values — a ZIP reader is required to accept this (general
      // purpose bit 3), and it is what makes streaming a file of unknown
      // length possible without buffering it first.
      const generalPurposeFlag = 0b0000000000001000
      const localHeader = Buffer.concat([
        u32(LOCAL_FILE_HEADER_SIGNATURE),
        u16(20), // version needed to extract
        u16(generalPurposeFlag),
        u16(0), // compression method: store
        u16(DOS_TIME),
        u16(DOS_DATE),
        u32(0), // crc-32 (deferred)
        u32(0), // compressed size (deferred)
        u32(0), // uncompressed size (deferred)
        u16(nameBuffer.length),
        u16(0), // extra field length
        nameBuffer,
      ])
      await write(localHeader)

      let crc = 0
      let size = 0
      if (Buffer.isBuffer(data)) {
        crc = crc32(data)
        size = data.length
        await write(data)
      } else {
        for await (const chunk of data) {
          crc = crc32(chunk, crc)
          size += chunk.length
          await write(chunk)
        }
      }

      if (size > MAX_ENTRY_SIZE) {
        throw new CogentaError({
          code: 'EXPORT_ENTRY_TOO_LARGE',
          message: `"${name}" is ${size} bytes; this writer does not implement ZIP64.`,
          hint: `Split the archive, or keep entries under ${MAX_ENTRY_SIZE} bytes.`,
          details: { name, size, max: MAX_ENTRY_SIZE },
        })
      }

      const descriptor = Buffer.concat([
        u32(0x08074b50), // optional but conventional signature
        u32(crc >>> 0),
        u32(size),
        u32(size),
      ])
      await write(descriptor)

      entries.push({ name: nameBuffer, crc32: crc >>> 0, size, offset: localHeaderOffset })
    },

    async finish() {
      const centralDirectoryStart = offset
      for (const entry of entries) {
        const header = Buffer.concat([
          u32(CENTRAL_DIRECTORY_SIGNATURE),
          u16(20), // version made by
          u16(20), // version needed to extract
          u16(0b0000000000001000), // general purpose flag (data descriptor used)
          u16(0), // compression method: store
          u16(DOS_TIME),
          u16(DOS_DATE),
          u32(entry.crc32),
          u32(entry.size),
          u32(entry.size),
          u16(entry.name.length),
          u16(0), // extra field length
          u16(0), // file comment length
          u16(0), // disk number start
          u16(0), // internal file attributes
          u32(0), // external file attributes
          u32(entry.offset),
          entry.name,
        ])
        await write(header)
      }
      const centralDirectorySize = offset - centralDirectoryStart

      const end = Buffer.concat([
        u32(END_OF_CENTRAL_DIRECTORY_SIGNATURE),
        u16(0), // this disk
        u16(0), // disk with central directory start
        u16(entries.length),
        u16(entries.length),
        u32(centralDirectorySize),
        u32(centralDirectoryStart),
        u16(0), // comment length
      ])
      await write(end)
    },
  }
}
