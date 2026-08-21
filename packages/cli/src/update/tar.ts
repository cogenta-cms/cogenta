import { gunzipSync } from 'node:zlib'

/**
 * A minimal, read-only ustar/pax reader — just enough to pull one small,
 * short-named text file (`package/CHANGELOG.md`) out of an npm tarball,
 * fetched straight from `registry.npmjs.org`'s own `dist.tarball` URL.
 *
 * No `tar` dependency (R9): npm tarballs are always ustar/pax, and the one
 * thing this needs from that format — "walk 512-byte header blocks, read a
 * file's name/size, skip to the next block" — is a couple dozen lines.
 * `readTarEntries` is deliberately **not** a general-purpose extractor: it
 * does not honour a pax extended header's own `path`/`size` overrides (typeflag
 * `x`), it only skips past them by their own declared size and reads the
 * *following* ustar header's `name`/`size` fields directly. That is exactly
 * enough for a path like `package/CHANGELOG.md` — well under the 100-byte
 * ustar name field, so no pax override is ever needed to represent it — and
 * deliberately not extended further than that real, verified need.
 */

export interface TarEntry {
  readonly name: string
  readonly content: Buffer
}

const BLOCK_SIZE = 512

/** Type flags this reader treats as "a real file to read", per the ustar spec. `'0'` and `'\0'` both mean "regular file". */
const REGULAR_FILE_TYPEFLAGS = new Set(['0', '\0'])

function readNullPaddedField(header: Buffer, offset: number, length: number): string {
  const raw = header.subarray(offset, offset + length)
  const nul = raw.indexOf(0)
  const trimmed = (nul === -1 ? raw : raw.subarray(0, nul)).toString('utf8')
  return trimmed.trim()
}

function readOctalSize(header: Buffer, offset: number, length: number): number {
  const raw = readNullPaddedField(header, offset, length)
  if (raw === '') return 0
  const parsed = Number.parseInt(raw, 8)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundUpToBlock(size: number): number {
  return Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
}

/** Parses an already-decompressed tar archive. */
export function readTarEntries(tar: Buffer): readonly TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0

  while (offset + BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK_SIZE)

    // Two consecutive all-zero blocks mark the end of the archive.
    if (header.every((byte) => byte === 0)) break

    const name = readNullPaddedField(header, 0, 100)
    const size = readOctalSize(header, 124, 12)
    const typeflag = String.fromCharCode(header[156] ?? 0)
    const dataStart = offset + BLOCK_SIZE
    const dataEnd = dataStart + size

    if (REGULAR_FILE_TYPEFLAGS.has(typeflag) && name !== '') {
      entries.push({ name, content: Buffer.from(tar.subarray(dataStart, dataEnd)) })
    }
    // Every other typeflag (pax extended header 'x'/'g', directory '5',
    // symlink '2', GNU long-name 'L'…) is skipped the same way: its data is
    // exactly `size` bytes, block-padded, whether or not this reader
    // understands what the bytes mean.

    offset = dataStart + roundUpToBlock(size)
  }

  return entries
}

/** Gunzips, then parses — the shape an npm registry `dist.tarball` download actually arrives in. */
export function readTarGz(gzipped: Buffer): readonly TarEntry[] {
  return readTarEntries(gunzipSync(gzipped))
}

/** `package/<relativePath>` — every npm tarball's own file entries are rooted at `package/`. */
export function findPackageFile(entries: readonly TarEntry[], relativePath: string): Buffer | null {
  const wanted = `package/${relativePath}`
  const found = entries.find((entry) => entry.name === wanted)
  return found === undefined ? null : found.content
}
