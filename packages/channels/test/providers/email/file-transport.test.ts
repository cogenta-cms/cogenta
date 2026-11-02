import { chmod, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFileEmailTransport } from '../../../src/providers/email/file-transport.js'

describe('createFileEmailTransport', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-email-'))
    dirs.push(dir)
    return dir
  }

  it('writes a real file containing the message headers and both bodies', async () => {
    const dir = await tempDir()
    const transport = createFileEmailTransport({ directory: dir })

    const sent = await transport.send({
      to: 'reader@example.com',
      subject: 'Test subject',
      text: 'plain body',
      html: '<p>html body</p>',
    })

    const files = await readdir(dir)
    expect(files).toHaveLength(1)
    const contents = await readFile(join(dir, files[0] as string), 'utf8')
    expect(contents).toContain('To: reader@example.com')
    expect(contents).toContain('Subject: Test subject')
    expect(contents).toContain(`Message-Id: ${sent.messageId}`)
    expect(contents).toContain('plain body')
    expect(contents).toContain('<p>html body</p>')
  })

  it('creates the target directory when it does not exist yet', async () => {
    const dir = join(await tempDir(), 'nested', 'deeper')
    const transport = createFileEmailTransport({ directory: dir })

    await transport.send({ to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' })

    const files = await readdir(dir)
    expect(files).toHaveLength(1)
  })

  it('writes one distinct file per message, never overwriting a prior send', async () => {
    const dir = await tempDir()
    const transport = createFileEmailTransport({ directory: dir })

    await transport.send({ to: 'a@example.com', subject: 'one', text: 't', html: '<p>t</p>' })
    await transport.send({ to: 'a@example.com', subject: 'two', text: 't', html: '<p>t</p>' })

    const files = await readdir(dir)
    expect(files).toHaveLength(2)
  })

  // A reset link or an invitation is a bearer credential, and this directory
  // is where a development site (or a small host) keeps every one it sends.
  it.skipIf(process.platform === 'win32')(
    'keeps the messages readable by their owner only, the directory and each file',
    async () => {
      const dir = join(await tempDir(), 'mail')
      const transport = createFileEmailTransport({ directory: dir })

      await transport.send({ to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' })

      const [name] = await readdir(dir)
      expect((await stat(dir)).mode & 0o777).toBe(0o700)
      expect((await stat(join(dir, name as string))).mode & 0o777).toBe(0o600)
    },
  )

  it.skipIf(process.platform === 'win32')(
    'tightens a directory that already exists with looser permissions',
    async () => {
      const dir = await tempDir()
      await chmod(dir, 0o755)
      const transport = createFileEmailTransport({ directory: dir })

      await transport.send({ to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' })

      expect((await stat(dir)).mode & 0o777).toBe(0o700)
    },
  )
})
