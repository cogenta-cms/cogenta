import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyApprovalLinkSignature } from '../../../src/approvals/signed-link.js'
import { buildAlert } from '../../../src/formats/alert.js'
import { buildNotification } from '../../../src/formats/notification.js'
import { createEmailAdapter } from '../../../src/providers/email/adapter.js'
import { createFileEmailTransport } from '../../../src/providers/email/file-transport.js'

describe('createEmailAdapter', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-email-adapter-'))
    dirs.push(dir)
    return dir
  }

  it('declares honest, buttonless, outbound-only capabilities', () => {
    const adapter = createEmailAdapter({
      transport: createFileEmailTransport({ directory: '/tmp' }),
    })

    expect(adapter.name).toBe('email')
    expect(adapter.capabilities).toEqual({
      richText: true,
      buttons: false,
      threads: false,
      attachments: false,
      inbound: false,
    })
    expect(adapter.onInbound).toBeUndefined()
  })

  it('refuses identity verification with a clear, typed error', async () => {
    const adapter = createEmailAdapter({
      transport: createFileEmailTransport({ directory: '/tmp' }),
    })

    await expect(adapter.verifyIdentity({})).rejects.toThrow(/outbound-only/)
  })

  it('sends a notification through the real file transport and returns its message id', async () => {
    const dir = await tempDir()
    const adapter = createEmailAdapter({ transport: createFileEmailTransport({ directory: dir }) })

    const messageId = await adapter.send(
      { id: 'reader@example.com' },
      buildNotification('Deployed.'),
    )

    const files = await readdir(dir)
    expect(files).toHaveLength(1)
    const contents = await readFile(join(dir, files[0] as string), 'utf8')
    expect(contents).toContain(`Message-Id: ${messageId}`)
    expect(contents).toContain('To: reader@example.com')
    expect(contents).toContain('Deployed.')
  })

  it('renders an approval alert as a real, independently verifiable signed link', async () => {
    const dir = await tempDir()
    const signingKey = 'test-signing-key'
    const adapter = createEmailAdapter({
      transport: createFileEmailTransport({ directory: dir }),
      actionLinks: {
        baseUrl: 'https://cogenta.example/approve',
        signingKey,
        expiresInSeconds: 1200,
      },
    })
    const message = buildAlert({
      title: 'Approval needed',
      severity: 'warning',
      context: 'ctx',
      expectedAction: 'act',
      adminUrl: 'https://admin.example.com/1',
      actions: [{ id: 'approve REALTOKEN', label: 'Approuver' }],
    })

    await adapter.send({ id: 'reader@example.com' }, message)

    const files = await readdir(dir)
    const contents = await readFile(join(dir, files[0] as string), 'utf8')
    const url = new URL(/https:\/\/cogenta\.example\/approve\?\S+/.exec(contents)?.[0] ?? '')
    expect(url.searchParams.get('token')).toBe('REALTOKEN')
    expect(url.searchParams.get('decision')).toBe('approved')
    const signature = url.searchParams.get('signature')
    const expires = Number(url.searchParams.get('expires'))
    expect(signature).not.toBeNull()
    expect(
      verifyApprovalLinkSignature(signingKey, 'REALTOKEN', 'approved', expires, signature ?? ''),
    ).toBe(true)
  })
})
