import { type FileHandle, open } from 'node:fs/promises'
import { CogentaError } from '@cogenta/core'

/**
 * Reads back what `zip-writer.ts` writes: a store-mode ZIP with a trailing
 * data descriptor per entry. Random-access, via the file's own end-of-central-
 * directory record — a backup or media archive is read from disk (never from
 * an in-memory buffer), so seeking to exactly the bytes one entry needs costs
 * nothing extra, and the file itself is never read in full.
 */

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const LOCAL_HEADER_FIXED_LENGTH = 30
/** The end-of-central-directory record is 22 bytes, plus up to 65535 bytes of comment this writer never sets — 4 KiB covers any real file. */
const EOCD_SEARCH_WINDOW = 4096

/**
 * The end-of-central-directory record counts entries in 16 bits, so no
 * archive this reader can open holds more; a caller restoring something
 * smaller by nature can say so.
 */
export const ZIP_MAX_ENTRIES = 0xffff

export interface OpenZipOptions {
  /** Refuse an archive listing more entries than this. Defaults to `ZIP_MAX_ENTRIES`. */
  readonly maxEntries?: number
}

/** The shortest central directory entry: the fixed 46 bytes, an empty name. */
const CENTRAL_ENTRY_FIXED_LENGTH = 46

export interface ZipEntry {
  readonly name: string
  readonly size: number
  readonly localHeaderOffset: number
}

export interface ZipReader {
  readonly entries: readonly ZipEntry[]
  /** Streams one entry's raw (stored, uncompressed) bytes in fixed-size chunks. */
  read(name: string): AsyncGenerator<Buffer>
  close(): Promise<void>
}

function notAnArchive(cause?: unknown): CogentaError {
  return new CogentaError({
    code: 'EXPORT_FORMAT_INVALID',
    message: 'This file is not a Cogenta archive (no end-of-central-directory record found).',
    hint: 'Restore only files produced by `cogenta backup` / `@cogenta/export`.',
    ...(cause === undefined ? {} : { cause }),
  })
}

/** The archive parses as one but says things the file cannot hold: a size, an offset, a count. */
function inconsistentArchive(what: string): CogentaError {
  return new CogentaError({
    code: 'EXPORT_FORMAT_INVALID',
    message: `This archive is damaged or not what it claims to be: ${what}.`,
    hint: 'Restore only files produced by `cogenta backup` / `@cogenta/export`, and re-download the file if it was truncated.',
  })
}

export async function openZip(path: string, options: OpenZipOptions = {}): Promise<ZipReader> {
  const handle = await open(path, 'r')
  try {
    return await readArchive(handle, options)
  } catch (error) {
    await handle.close()
    throw error
  }
}

async function readArchive(handle: FileHandle, options: OpenZipOptions): Promise<ZipReader> {
  const maxEntries = Math.min(options.maxEntries ?? ZIP_MAX_ENTRIES, ZIP_MAX_ENTRIES)
  const stat = await handle.stat()
  const tailLength = Math.min(EOCD_SEARCH_WINDOW, stat.size)
  const tail = Buffer.alloc(tailLength)
  await handle.read(tail, 0, tailLength, stat.size - tailLength)

  let eocdOffset = -1
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) throw notAnArchive()

  const entryCount = tail.readUInt16LE(eocdOffset + 10)
  const centralDirectorySize = tail.readUInt32LE(eocdOffset + 12)
  const centralDirectoryStart = tail.readUInt32LE(eocdOffset + 16)

  // Every number above is the file's own claim. Checked against the file
  // before it sizes an allocation or a read: a 4 GiB "central directory" in a
  // 1 KiB file must be refused, not allocated.
  const eocdPosition = stat.size - tailLength + eocdOffset
  if (entryCount > maxEntries) {
    throw inconsistentArchive(`it lists ${entryCount} entries, more than the ${maxEntries} allowed`)
  }
  if (centralDirectoryStart + centralDirectorySize > eocdPosition) {
    throw inconsistentArchive('its central directory does not lie inside the file')
  }
  if (entryCount * CENTRAL_ENTRY_FIXED_LENGTH > centralDirectorySize) {
    throw inconsistentArchive('its central directory is too small for the entries it lists')
  }

  const centralDirectory = Buffer.alloc(centralDirectorySize)
  const { bytesRead } = await handle.read(
    centralDirectory,
    0,
    centralDirectorySize,
    centralDirectoryStart,
  )
  if (bytesRead !== centralDirectorySize) {
    throw inconsistentArchive('its central directory is cut short')
  }

  const entries: ZipEntry[] = []
  let cursor = 0
  // A stored archive cannot hold more content than it has bytes: the sum of
  // what its entries claim is bounded by the file, whatever their headers say.
  let declaredTotal = 0
  for (let i = 0; i < entryCount; i += 1) {
    if (
      cursor + CENTRAL_ENTRY_FIXED_LENGTH > centralDirectory.length ||
      centralDirectory.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw notAnArchive()
    }
    const size = centralDirectory.readUInt32LE(cursor + 24)
    const nameLength = centralDirectory.readUInt16LE(cursor + 28)
    const extraLength = centralDirectory.readUInt16LE(cursor + 30)
    const commentLength = centralDirectory.readUInt16LE(cursor + 32)
    const localHeaderOffset = centralDirectory.readUInt32LE(cursor + 42)
    const nameStart = cursor + CENTRAL_ENTRY_FIXED_LENGTH
    if (nameStart + nameLength + extraLength + commentLength > centralDirectory.length) {
      throw inconsistentArchive('an entry name runs past the end of the central directory')
    }
    if (localHeaderOffset + LOCAL_HEADER_FIXED_LENGTH + size > centralDirectoryStart) {
      throw inconsistentArchive(`the entry's data would lie outside the file`)
    }
    declaredTotal += size
    if (declaredTotal > stat.size) {
      throw inconsistentArchive('its entries claim more data than the file holds')
    }
    const name = centralDirectory.toString('utf8', nameStart, nameStart + nameLength)
    entries.push({ name, size, localHeaderOffset })
    cursor = nameStart + nameLength + extraLength + commentLength
  }

  return {
    entries,
    async *read(name: string): AsyncGenerator<Buffer> {
      const entry = entries.find((candidate) => candidate.name === name)
      if (entry === undefined) {
        throw new CogentaError({
          code: 'EXPORT_FORMAT_INVALID',
          message: `The archive has no entry named "${name}".`,
          hint: 'The archive is incomplete or was not produced by this package.',
          details: { name },
        })
      }
      yield* readEntryBody(handle, entry, stat.size)
    },
    close: () => handle.close(),
  }
}

async function* readEntryBody(
  handle: FileHandle,
  entry: ZipEntry,
  fileSize: number,
): AsyncGenerator<Buffer> {
  const header = Buffer.alloc(LOCAL_HEADER_FIXED_LENGTH)
  const headerRead = await handle.read(
    header,
    0,
    LOCAL_HEADER_FIXED_LENGTH,
    entry.localHeaderOffset,
  )
  if (headerRead.bytesRead !== LOCAL_HEADER_FIXED_LENGTH) {
    throw inconsistentArchive(`the header of "${entry.name}" is cut short`)
  }
  const nameLength = header.readUInt16LE(26)
  const extraLength = header.readUInt16LE(28)
  const dataStart = entry.localHeaderOffset + LOCAL_HEADER_FIXED_LENGTH + nameLength + extraLength
  if (dataStart + entry.size > fileSize) {
    throw inconsistentArchive(`the data of "${entry.name}" runs past the end of the file`)
  }

  const CHUNK_SIZE = 64 * 1024
  let remaining = entry.size
  let position = dataStart
  while (remaining > 0) {
    const size = Math.min(CHUNK_SIZE, remaining)
    const buffer = Buffer.alloc(size)
    const { bytesRead } = await handle.read(buffer, 0, size, position)
    if (bytesRead !== size) throw inconsistentArchive(`"${entry.name}" is cut short`)
    yield buffer
    remaining -= size
    position += size
  }
}
