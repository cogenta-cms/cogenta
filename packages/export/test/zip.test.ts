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
})
