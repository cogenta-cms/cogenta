import { createSqliteHandle } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createScheduledTaskRegistry } from '../../src/scheduling/registry.js'

async function testRegistry(now: () => number = Date.now) {
  const db = await createSqliteHandle({ url: ':memory:' })
  return createScheduledTaskRegistry({ db, now })
}

describe('createScheduledTaskRegistry', () => {
  it('says a task appears at the screen from one declaration, with no state until it runs', async () => {
    const registry = await testRegistry()
    registry.register({
      name: 'publish',
      description: 'Scheduled publication',
      intervalMs: 60_000,
      run: async () => undefined,
    })

    const states = await registry.list()
    expect(states).toHaveLength(1)
    expect(states[0]?.name).toBe('publish')
    expect(states[0]?.lastRun).toBeNull()
    expect(states[0]?.recentRuns).toEqual([])
  })

  it('refuses to register the same task name twice', async () => {
    const registry = await testRegistry()
    registry.register({
      name: 'dup',
      description: 'x',
      intervalMs: 1000,
      run: async () => undefined,
    })

    expect(() =>
      registry.register({
        name: 'dup',
        description: 'y',
        intervalMs: 2000,
        run: async () => undefined,
      }),
    ).toThrowError(/dup/)
  })

  it('records a successful run with its summary', async () => {
    const registry = await testRegistry()
    registry.register({
      name: 'purge',
      description: 'Trash purge',
      intervalMs: 60_000,
      run: async () => ({ summary: '3 purged' }),
    })

    const run = await registry.runNow('purge')
    expect(run.outcome).toBe('success')
    expect(run.summary).toBe('3 purged')
    expect(run.triggeredBy).toBe('manual')

    const state = await registry.get('purge')
    expect(state?.lastRun?.id).toBe(run.id)
    expect(state?.recentRuns).toHaveLength(1)
  })

  it('records a failing run instead of throwing — the caller always gets a run back', async () => {
    const registry = await testRegistry()
    registry.register({
      name: 'flaky',
      description: 'x',
      intervalMs: 60_000,
      run: async () => {
        throw new Error('database is on fire')
      },
    })

    const run = await registry.runNow('flaky')
    expect(run.outcome).toBe('error')
    expect(run.error).toContain('database is on fire')
  })

  it('throws for an unregistered task name', async () => {
    const registry = await testRegistry()
    await expect(registry.runNow('nope')).rejects.toMatchObject({ code: 'SCHEDULER_TASK_UNKNOWN' })
  })

  it('journals who ran a task manually', async () => {
    const registry = await testRegistry()
    registry.register({
      name: 'audit',
      description: 'x',
      intervalMs: 60_000,
      run: async () => undefined,
    })

    const run = await registry.runNow('audit', { actor: 'user-42' })
    expect(run.actor).toBe('user-42')
    expect(run.triggeredBy).toBe('manual')
  })

  it('tick() runs only tasks whose interval has elapsed', async () => {
    let clock = 1_700_000_000_000
    const registry = await testRegistry(() => clock)

    let fastRuns = 0
    let slowRuns = 0
    registry.register({
      name: 'fast',
      description: 'x',
      intervalMs: 1000,
      run: async () => {
        fastRuns += 1
      },
    })
    registry.register({
      name: 'slow',
      description: 'x',
      intervalMs: 100_000,
      run: async () => {
        slowRuns += 1
      },
    })

    // Never run before: both are due immediately.
    expect((await registry.tick(clock)).ran.sort()).toEqual(['fast', 'slow'])
    expect(fastRuns).toBe(1)
    expect(slowRuns).toBe(1)

    clock += 2000
    expect((await registry.tick(clock)).ran).toEqual(['fast'])
    expect(fastRuns).toBe(2)
    expect(slowRuns).toBe(1)
  })

  it('flags a task overdue once it is more than twice its interval late', async () => {
    let clock = 1_700_000_000_000
    const registry = await testRegistry(() => clock)
    registry.register({
      name: 'daily',
      description: 'x',
      intervalMs: 1000,
      run: async () => undefined,
    })

    await registry.tick(clock)
    expect((await registry.get('daily'))?.overdue).toBe(false)

    clock += 1000 // one interval late: due, not yet overdue
    expect((await registry.get('daily'))?.overdue).toBe(false)

    clock += 1500 // more than two intervals since the last run
    expect((await registry.get('daily'))?.overdue).toBe(true)
  })

  it('flags a never-run task overdue — the state an unwired external cron leaves everything in', async () => {
    const registry = await testRegistry()
    registry.register({
      name: 'never',
      description: 'x',
      intervalMs: 60_000,
      run: async () => undefined,
    })

    expect((await registry.get('never'))?.overdue).toBe(true)
  })

  it('survives a restart: a fresh registry on the same database sees the persisted last run', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    let clock = 1_700_000_000_000

    const before = createScheduledTaskRegistry({ db, now: () => clock })
    before.register({
      name: 'publish',
      description: 'x',
      intervalMs: 60_000,
      run: async () => undefined,
    })
    await before.runNow('publish')

    clock += 45_000
    // A brand-new registry instance, standing in for a process restart — the
    // same table, a different in-memory object.
    const after = createScheduledTaskRegistry({ db, now: () => clock })
    after.register({
      name: 'publish',
      description: 'x',
      intervalMs: 60_000,
      run: async () => undefined,
    })

    const state = await after.get('publish')
    expect(state?.lastRun).not.toBeNull()
    expect(state?.overdue).toBe(false) // 45s < 2x60s
  })

  it('prunes run history beyond keepRuns', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    const registry = createScheduledTaskRegistry({ db, keepRuns: 3 })
    registry.register({
      name: 'chatty',
      description: 'x',
      intervalMs: 1,
      run: async () => undefined,
    })

    for (let i = 0; i < 6; i += 1) await registry.runNow('chatty')

    const state = await registry.get('chatty')
    expect(state?.recentRuns).toHaveLength(3)
  })
})
