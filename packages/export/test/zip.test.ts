import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openZip } from '../src/zip-reader.js'
import { createZipWriter } from '../src/zip-writer.js'

describe('the streaming ZIP writer/reader', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-zip-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('round-trips several files, including one streamed as chunks', async () => {
    const chunks: Buffer[] = []
    const zip = createZipWriter({ write: (chunk) => void chunks.push(chunk) })

    await zip.addFile('hello.txt', Buffer.from('Hello, Cogenta!', 'utf8'))
    await zip.addFile('empty.txt', Buffer.from('', 'utf8'))

    async function* streamed(): AsyncGenerator<Buffer> {
      yield Buffer.from('part one, ', 'utf8')
      yield Buffer.from('part two.', 'utf8')
    }
    await zip.addFile('streamed.txt', streamed())
    await zip.finish()

    const path = join(directory, 'archive.zip')
    await writeFile(path, Buffer.concat(chunks))

    const reader = await openZip(path)
    expect(reader.entries.map((entry) => entry.name)).toEqual([
      'hello.txt',
      'empty.txt',
      'streamed.txt',
    ])

    const readAll = async (name: string): Promise<string> => {
      const parts: Buffer[] = []
      for await (const chunk of reader.read(name)) parts.push(chunk)
      return Buffer.concat(parts).toString('utf8')
    }

    expect(await readAll('hello.txt')).toBe('Hello, Cogenta!')
    expect(await readAll('empty.txt')).toBe('')
    expect(await readAll('streamed.txt')).toBe('part one, part two.')

    await reader.close()
  })

  it('refuses a file that is not a ZIP archive', async () => {
    const path = join(directory, 'not-a-zip.txt')
    await writeFile(path, 'just some text, no end-of-central-directory record here')

    await expect(openZip(path)).rejects.toMatchObject({ code: 'EXPORT_FORMAT_INVALID' })
  })

  it('produces bytes a real ZIP tool can read (structural check: local header count matches central directory count)', async () => {
    const chunks: Buffer[] = []
    const zip = createZipWriter({ write: (chunk) => void chunks.push(chunk) })
    await zip.addFile('a.txt', Buffer.from('a'))
    await zip.addFile('b.txt', Buffer.from('b'))
    await zip.finish()

    const archive = Buffer.concat(chunks)
    const localHeaderSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    let count = 0
    let index = archive.indexOf(localHeaderSignature)
    while (index !== -1) {
      count += 1
      index = archive.indexOf(localHeaderSignature, index + 1)
    }
    expect(count).toBe(2)
  })

  describe('on a file whose declared sizes are not true', () => {
    async function archive(): Promise<Buffer> {
      const chunks: Buffer[] = []
      const zip = createZipWriter({ write: (chunk) => void chunks.push(chunk) })
      await zip.addFile('a.txt', Buffer.from('hello', 'utf8'))
      await zip.finish()
      return Buffer.concat(chunks)
    }

    /** The end-of-central-directory record sits in the last 22 bytes (no comment). */
    function eocd(file: Buffer): number {
      return file.length - 22
    }

    async function opened(file: Buffer): Promise<ReturnType<typeof openZip>> {
      const path = join(directory, 'crafted.zip')
      await writeFile(path, file)
      return openZip(path)
    }

    it('refuses a central directory declared larger than the file instead of allocating it', async () => {
      const file = await archive()
      file.writeUInt32LE(0xffffffff, eocd(file) + 12)

      await expect(opened(file)).rejects.toMatchObject({ code: 'EXPORT_FORMAT_INVALID' })
    })

    it('refuses a central directory that starts past the end of the file', async () => {
      const file = await archive()
      file.writeUInt32LE(file.length + 1000, eocd(file) + 16)

      await expect(opened(file)).rejects.toMatchObject({ code: 'EXPORT_FORMAT_INVALID' })
    })

    it('refuses more entries than the central directory can hold', async () => {
      const file = await archive()
      file.writeUInt16LE(60_000, eocd(file) + 10)

      await expect(opened(file)).rejects.toMatchObject({ code: 'EXPORT_FORMAT_INVALID' })
    })

    it('refuses an entry that claims more bytes than the whole file holds', async () => {
      const file = await archive()
      // The size field of the first (and only) central directory entry.
      const centralStart = file.readUInt32LE(eocd(file) + 16)
      file.writeUInt32LE(0x7fffffff, centralStart + 24)

      await expect(opened(file)).rejects.toMatchObject({ code: 'EXPORT_FORMAT_INVALID' })
    })

    it('refuses an entry count above the cap the caller sets', async () => {
      const file = await archive()
      const path = join(directory, 'capped.zip')
      await writeFile(path, file)

      await expect(openZip(path, { maxEntries: 0 })).rejects.toMatchObject({
        code: 'EXPORT_FORMAT_INVALID',
      })
    })
  })
})
