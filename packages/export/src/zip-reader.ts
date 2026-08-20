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

export async function openZip(path: string): Promise<ZipReader> {
  const handle = await open(path, 'r')
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
  if (eocdOffset === -1) {
    await handle.close()
    throw notAnArchive()
  }

  const entryCount = tail.readUInt16LE(eocdOffset + 10)
  const centralDirectorySize = tail.readUInt32LE(eocdOffset + 12)
  const centralDirectoryStart = tail.readUInt32LE(eocdOffset + 16)

  const centralDirectory = Buffer.alloc(centralDirectorySize)
  await handle.read(centralDirectory, 0, centralDirectorySize, centralDirectoryStart)

  const entries: ZipEntry[] = []
  let cursor = 0
  for (let i = 0; i < entryCount; i += 1) {
    if (centralDirectory.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      await handle.close()
      throw notAnArchive()
    }
    const size = centralDirectory.readUInt32LE(cursor + 24)
    const nameLength = centralDirectory.readUInt16LE(cursor + 28)
    const extraLength = centralDirectory.readUInt16LE(cursor + 30)
    const commentLength = centralDirectory.readUInt16LE(cursor + 32)
    const localHeaderOffset = centralDirectory.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
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
      yield* readEntryBody(handle, entry)
    },
    close: () => handle.close(),
  }
}

async function* readEntryBody(handle: FileHandle, entry: ZipEntry): AsyncGenerator<Buffer> {
  const header = Buffer.alloc(LOCAL_HEADER_FIXED_LENGTH)
  await handle.read(header, 0, LOCAL_HEADER_FIXED_LENGTH, entry.localHeaderOffset)
  const nameLength = header.readUInt16LE(26)
  const extraLength = header.readUInt16LE(28)
  const dataStart = entry.localHeaderOffset + LOCAL_HEADER_FIXED_LENGTH + nameLength + extraLength

  const CHUNK_SIZE = 64 * 1024
  let remaining = entry.size
  let position = dataStart
  while (remaining > 0) {
    const size = Math.min(CHUNK_SIZE, remaining)
    const buffer = Buffer.alloc(size)
    await handle.read(buffer, 0, size, position)
    yield buffer
    remaining -= size
    position += size
  }
}
