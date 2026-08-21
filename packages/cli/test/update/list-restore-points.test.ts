import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createSiteBackup } from '../../src/commands/backup.js'
import { listRestorePoints } from '../../src/update/list-restore-points.js'

async function project(): Promise<{ readonly root: string; readonly dbPath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-restore-points-'))
  const dbPath = join(root, 'site.db')
  await (await createSqliteHandle({ url: dbPath })).close()
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(dbPath)} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')
  return { root, dbPath }
}

describe('listRestorePoints', () => {
  it('returns an empty list when no backup directory exists yet', async () => {
    const { root } = await project()
    expect(await listRestorePoints(join(root, '.cogenta', 'backups'))).toEqual([])
  })

  it('marks an update- prefixed backup as triggeredByUpdate, and a plain one as not', async () => {
    const { root } = await project()
    const dir = join(root, '.cogenta', 'backups')

    await createSiteBackup({ cwd: root, dir })
    await createSiteBackup({ cwd: root, dir, filenamePrefix: 'update-' })

    const points = await listRestorePoints(dir)
    expect(points).toHaveLength(2)
    expect(points.filter((point) => point.triggeredByUpdate)).toHaveLength(1)
    expect(points.filter((point) => !point.triggeredByUpdate)).toHaveLength(1)
    for (const point of points) {
      expect(point.tables).toBeGreaterThan(0)
      expect(point.checksum).not.toBe('')
    }
  })
})
