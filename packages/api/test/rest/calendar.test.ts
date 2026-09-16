import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asEditor,
  asViewer,
  bodyOf,
  createHarness,
  dataOf,
  type Harness,
  request,
} from './harness.js'

/**
 * `GET /-/calendar` (L35) — what comes out when.
 *
 * The questions an editorial calendar answers, asserted against a real store:
 * which entries fall in a window, which drafts could still be placed, who may
 * move them, and that nobody learns from it what they could not already read.
 */

describe('GET /-/calendar', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  const window = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }
  const calendar = async (query: Record<string, string> = window, context = asEditor) =>
    harness.router.handle(request('GET', '/-/calendar', { query }), context)

  async function scheduled(title: string, publishedAt: string): Promise<string> {
    const store = harness.store(ARTICLE)
    const entry = await store.create({ values: { title } })
    await store.unpublish(entry.id, { status: 'scheduled', publishedAt })
    return entry.id
  }

  it('lists what is scheduled or published inside the window, earliest first', async () => {
    await scheduled('Late October', '2026-10-28T09:00:00.000Z')
    await scheduled('Early October', '2026-10-02T09:00:00.000Z')
    await scheduled('November', '2026-11-03T09:00:00.000Z')

    const data = dataOf(await calendar())
    const items = data['items'] as { title: string; status: string; canSchedule: boolean }[]

    expect(items.map((item) => item.title)).toEqual(['Early October', 'Late October'])
    expect(items.every((item) => item.status === 'scheduled' && item.canSchedule)).toBe(true)
    expect(data['truncated']).toBe(false)
  })

  it('offers drafts to schedule without placing them on a day', async () => {
    const store = harness.store(ARTICLE)
    await store.create({ values: { title: 'Idea for later' } })

    const data = dataOf(await calendar())

    expect(data['items']).toEqual([])
    const unscheduled = data['unscheduled'] as { title: string; status: string }[]
    expect(unscheduled.map((item) => item.title)).toEqual(['Idea for later'])
  })

  it('shows nothing unpublished to someone who may not read it', async () => {
    await scheduled('Embargoed', '2026-10-10T09:00:00.000Z')
    await harness.store(ARTICLE).create({ values: { title: 'Secret draft' } })

    const data = dataOf(await calendar(window, asViewer))

    // A planning tool is a list of what has not come out yet: for a reader
    // without access to that, there is nothing in it — not even the dates.
    expect(data['items']).toEqual([])
    expect(data['unscheduled']).toEqual([])
  })

  it('refuses a window that is missing, backwards or wider than a quarter', async () => {
    for (const query of [
      {},
      { from: 'yesterday', to: window.to },
      { from: window.to, to: window.from },
      { from: '2026-01-01T00:00:00.000Z', to: '2026-06-01T00:00:00.000Z' },
    ]) {
      const response = await calendar(query)
      expect(response.status).toBe(400)
      expect((bodyOf(response)['error'] as { code: string }).code).toBe('QUERY_INVALID')
    }
  })
})
