import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { serveAdminAsset } from '../src/commands/admin-assets.js'

let cleanupDirs: string[] = []

afterEach(async () => {
  await Promise.all(cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  cleanupDirs = []
})

async function fixtureAssetsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cogenta-admin-assets-'))
  cleanupDirs.push(dir)
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>admin</title>')
  await mkdir(join(dir, 'assets'), { recursive: true })
  await writeFile(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)')
  await writeFile(join(dir, 'assets', 'index-abc123.css'), 'body{}')
  return dir
}

describe('serveAdminAsset', () => {
  it('serves index.html for the bare /admin path', async () => {
    const dir = await fixtureAssetsDir()
    const asset = await serveAdminAsset('/admin', dir)
    expect(asset?.contentType).toBe('text/html; charset=utf-8')
    expect(asset?.body.toString()).toContain('<title>admin</title>')
  })

  it('serves index.html for a deep SPA route, letting the client router resolve it', async () => {
    const dir = await fixtureAssetsDir()
    const asset = await serveAdminAsset('/admin/collections/post', dir)
    expect(asset?.contentType).toBe('text/html; charset=utf-8')
  })

  it('serves a real built asset with its own content type', async () => {
    const dir = await fixtureAssetsDir()
    const asset = await serveAdminAsset('/admin/assets/index-abc123.js', dir)
    expect(asset?.contentType).toBe('text/javascript; charset=utf-8')
    expect(asset?.body.toString()).toBe('console.log(1)')
  })

  it('returns null for a missing real asset, never falling back to index.html', async () => {
    const dir = await fixtureAssetsDir()
    const asset = await serveAdminAsset('/admin/assets/missing.js', dir)
    expect(asset).toBeNull()
  })

  it('returns null when the admin build is not present at all', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-admin-assets-empty-'))
    cleanupDirs.push(dir)
    const asset = await serveAdminAsset('/admin', dir)
    expect(asset).toBeNull()
  })

  it('never escapes the assets directory on a path-traversal attempt', async () => {
    const dir = await fixtureAssetsDir()
    // `path.join` never lets a resolved segment escape its first argument —
    // this stays a 404 inside `dir`, not a read of a real file elsewhere.
    const asset = await serveAdminAsset('/admin/../../../etc/passwd.js', dir)
    expect(asset).toBeNull()
  })
})
