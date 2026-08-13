import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDatabaseQueue,
  createLogger,
  createSqliteHandle,
  type DatabaseHandle,
  type QueueDriver,
} from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cancelPublication,
  parsePayload,
  registerScheduledPublishing,
  reschedulePublication,
  SCHEDULED_PUBLISH_JOB,
  type ScheduledPublication,
  schedulePublication,
} from '../../src/scheduling/publish.js'

const silent = createLogger({ level: 'silent' })

/**
 * The acceptance criterion of L1: *a scheduled entry publishes on time, with
 * the `database` queue too*. So the test runs the real degraded driver — a SQL
 * table with no worker of its own — and drains it the way a cron would, by
 * calling `tick()`.
 */
describe('scheduled publication on the database queue', () => {
  let root: string
  let db: DatabaseHandle
  let queue: QueueDriver
  let clock = 0
  const published: ScheduledPublication[] = []

  const NINE_AM = Date.parse('2026-09-01T09:00:00Z')

  beforeEach(async () => {
    // A file rather than :memory:, because the queue opens the same database
    // for its own table and an in-memory handle is private to one connection.
    root = await mkdtemp(join(tmpdir(), 'cogenta-schedule-'))
    db = await createSqliteHandle({ url: join(root, 'site.db') })

    clock = Date.parse('2026-09-01T08:00:00Z')
    queue = createDatabaseQueue({ db, logger: silent, now: () => clock })
    published.length = 0

    registerScheduledPublishing(
      queue,
      async (publication) => {
        published.push(publication)
      },
      { logger: silent },
    )
  })

  afterEach(async () => {
    await queue.close()
    await db.close()
    await rm(root, { recursive: true, force: true })
  })

  it('leaves the entry alone until its hour comes', async () => {
    await schedulePublication(queue, {
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      publishAt: NINE_AM,
    })

    await expect(queue.tick()).resolves.toBe(0)
    expect(published).toHaveLength(0)
  })

  it('publishes on the first tick after the hour', async () => {
    await schedulePublication(queue, {
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      publishAt: new Date(NINE_AM),
    })

    // What a cron every five minutes looks like: the tick lands after the hour,
    // not on it. That lateness is the honest promise of a host with no worker.
    clock = NINE_AM + 4 * 60 * 1000

    await expect(queue.tick()).resolves.toBe(1)
    expect(published).toEqual([
      { collection: 'article', entryId: 'entry-1', locale: 'fr', publishAt: NINE_AM },
    ])
  })

  it('publishes only once, however often the cron runs', async () => {
    await schedulePublication(queue, {
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      publishAt: NINE_AM,
    })

    clock = NINE_AM + 1000
    await queue.tick()
    await queue.tick()
    await queue.tick()

    expect(published).toHaveLength(1)
  })

  it('catches up on an entry whose hour passed while the site was down', async () => {
    await schedulePublication(queue, {
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      publishAt: '2026-08-01T09:00:00Z',
    })

    await expect(queue.tick()).resolves.toBe(1)
    expect(published).toHaveLength(1)
  })

  it('keeps the two translations of one entry as two publications', async () => {
    await schedulePublication(queue, {
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      publishAt: NINE_AM,
    })
    await schedulePublication(queue, {
      collection: 'article',
      entryId: 'entry-2',
      locale: 'en',
      publishAt: NINE_AM,
    })

    clock = NINE_AM + 1000
    await queue.tick()

    expect(published.map((entry) => entry.locale).sort()).toEqual(['en', 'fr'])
  })

  it('does not publish an entry whose schedule was cancelled', async () => {
    const jobId = await schedulePublication(queue, {
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      publishAt: NINE_AM,
    })

    await cancelPublication(queue, jobId)
    clock = NINE_AM + 1000
    await queue.tick()

    expect(published).toHaveLength(0)
    await expect(queue.status(jobId)).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('leaves one job behind after a reschedule, not two', async () => {
    const first = await schedulePublication(queue, {
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      publishAt: NINE_AM,
    })
    const second = await reschedulePublication(queue, first, {
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      publishAt: NINE_AM + 3600_000,
    })

    clock = NINE_AM + 2 * 3600_000
    await expect(queue.tick()).resolves.toBe(1)
    expect(published).toHaveLength(1)
    expect(second).not.toBe(first)
  })

  it('names the job so a cron can be told what it drains', () => {
    expect(SCHEDULED_PUBLISH_JOB).toBe('cogenta.content.publish')
  })

  it('refuses a date it cannot read rather than queueing a job that will fail later', async () => {
    await expect(
      schedulePublication(queue, {
        collection: 'article',
        entryId: 'entry-1',
        locale: 'fr',
        publishAt: 'next tuesday',
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_SCHEDULE_INVALID' })
  })
})

describe('the job payload', () => {
  it('survives the round trip through JSON', () => {
    const payload: ScheduledPublication = {
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      publishAt: 1_756_717_200_000,
    }

    expect(parsePayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload)
  })

  it('is refused when a hand-edited job row has lost a field', () => {
    expect(() => parsePayload({ collection: 'article', entryId: 'entry-1' })).toThrowError(
      /payload/,
    )
    expect(() => parsePayload(null)).toThrowError(/payload/)
  })
})
