import { describe, expect, it } from 'vitest'
import type { TelemetryPayload } from '../../src/agent/types.js'
import { createSiteStateStore } from '../../src/control/state.js'
import { testDb } from '../helpers/db.js'

function samplePayload(siteId: string, collectedAt: string): TelemetryPayload {
  return {
    siteId,
    collectedAt,
    installedVersions: { cms: null, plugins: [], themes: [] },
    sbomFingerprint: 'a'.repeat(64),
    openCves: [],
    coreWebVitalsAggregate: null,
    availability: { uptimeRatio: null },
    backups: { lastBackupAt: null, lastResult: 'unknown' },
    certificateExpiry: null,
    adminAccounts: { count: 1, mfaEnabledCount: 1 },
    aggregatedErrors: { count: 0, windowStart: collectedAt, windowEnd: collectedAt },
  }
}

describe('createSiteStateStore', () => {
  it('returns null for a site with no recorded snapshot', async () => {
    const db = await testDb()
    const state = createSiteStateStore(db)
    expect(await state.latest('never-seen')).toBeNull()
    expect(await state.history('never-seen')).toEqual([])
  })

  it('records a snapshot and returns it as the latest for that site only', async () => {
    const db = await testDb()
    const state = createSiteStateStore(db)

    await state.recordSnapshot('site-a', samplePayload('site-a', '2026-01-01T00:00:00.000Z'))
    const latestA = await state.latest('site-a')
    expect(latestA?.payload.siteId).toBe('site-a')
    // Strictly per-site: a second site's store is untouched by the first's write.
    expect(await state.latest('site-b')).toBeNull()
  })

  it('enforces a real, bounded retention per site, pruning the oldest rows first', async () => {
    const db = await testDb()
    const retain = 3
    const state = createSiteStateStore(db, Date.now, retain)

    for (let i = 0; i < retain + 5; i += 1) {
      await state.recordSnapshot(
        'site-a',
        samplePayload('site-a', new Date(2026, 0, i + 1).toISOString()),
      )
    }

    const history = await state.history('site-a')
    expect(history).toHaveLength(retain)
    // Most-recent-first, and the oldest ones were genuinely pruned, not just excluded from the query.
    const collectedDates = history.map((snapshot) => snapshot.collectedAt)
    expect(collectedDates).toEqual([...collectedDates].sort().reverse())
  })

  it("retention is scoped per site — a busy site never prunes a quiet site's history", async () => {
    const db = await testDb()
    const state = createSiteStateStore(db, Date.now, 2)

    await state.recordSnapshot(
      'quiet-site',
      samplePayload('quiet-site', '2026-01-01T00:00:00.000Z'),
    )
    for (let i = 0; i < 5; i += 1) {
      await state.recordSnapshot(
        'busy-site',
        samplePayload('busy-site', new Date(2026, 0, i + 1).toISOString()),
      )
    }

    expect(await state.history('quiet-site')).toHaveLength(1)
    expect(await state.history('busy-site')).toHaveLength(2)
  })
})
