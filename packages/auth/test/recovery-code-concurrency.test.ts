import { createSqliteHandle, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createCredentialStore } from '../src/credentials.js'
import { hashRecoveryCode } from '../src/recovery-codes.js'
import { TABLES } from '../src/tables.js'
import { type FileDb, testFileDb } from './helpers/db.js'

/**
 * A recovery code is a spare password: the whole safety property is that it
 * works exactly once (fiche 18 task 1, "Hachés, à usage unique"). This proves
 * that under real concurrent redemption, not just sequential calls.
 *
 * Two things make this a real test rather than a hopeful one, the same
 * discipline `packages/commerce/test/stock-concurrency.test.ts` already holds
 * itself to for stock:
 *
 * A **file**, not `:memory:` — two in-memory SQLite handles are two different
 * databases, and racing against them would prove only that two unrelated rows
 * can be written at once.
 *
 * A **naive control**. The last test here reimplements the wrong version —
 * read the row, decide in JavaScript, write it back — against the same file
 * and the same two connections, and asserts that it *does* let the same code
 * sign in twice. Without that control, a green result on the guarded version
 * would be equally consistent with "the guard works" and with "this test
 * never actually raced anything".
 */
describe('recovery codes — single use under real concurrency', () => {
  let fixture: FileDb | undefined
  let second: DatabaseHandle | undefined

  afterEach(async () => {
    if (second !== undefined) await second.close()
    if (fixture !== undefined) await fixture.dispose()
    second = undefined
    fixture = undefined
  })

  it('two simultaneous redemptions of the same code: exactly one succeeds', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const owner = createCredentialStore(fixture.db)
    const code = 'RACE0-CODE0'
    await owner.setRecoveryCodes('user-1', [await hashRecoveryCode(code)])

    // Two independent connections to the same file, each with its own
    // in-memory view of the row, racing to consume the identical code.
    const attackerA = createCredentialStore(fixture.db)
    const attackerB = createCredentialStore(second)

    const [resultA, resultB] = await Promise.all([
      attackerA.consumeRecoveryCode('user-1', code),
      attackerB.consumeRecoveryCode('user-1', code),
    ])

    expect([resultA, resultB].sort()).toEqual([false, true])

    const status = await owner.recoveryCodesStatus('user-1')
    expect(status).toEqual({ total: 1, remaining: 0 })
  })

  it('ten simultaneous redemptions of the same code: exactly one succeeds', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const owner = createCredentialStore(fixture.db)
    const code = 'STORM-CODE0'
    await owner.setRecoveryCodes('user-1', [await hashRecoveryCode(code)])

    // Alternating between two real connections, so half the attempts come
    // from a client that has never seen the other's writes.
    const attackers = Array.from({ length: 10 }, (_unused, index) =>
      createCredentialStore(index % 2 === 0 ? (fixture as FileDb).db : (second as DatabaseHandle)),
    )

    const results = await Promise.all(
      attackers.map((attacker) => attacker.consumeRecoveryCode('user-1', code)),
    )

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await owner.recoveryCodesStatus('user-1')).toEqual({ total: 1, remaining: 0 })
  })

  it('never lets a race consume the wrong code from a real batch of ten', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const owner = createCredentialStore(fixture.db)
    const codes = Array.from({ length: 10 }, (_unused, index) => `BATCH${index}-CODE0`)
    await owner.setRecoveryCodes('user-1', await Promise.all(codes.map(hashRecoveryCode)))

    // Two different codes from the same batch, redeemed at the same instant
    // from two independent connections — both are legitimate, both must win.
    const attackerA = createCredentialStore(fixture.db)
    const attackerB = createCredentialStore(second)

    const [resultA, resultB] = await Promise.all([
      attackerA.consumeRecoveryCode('user-1', codes[0] as string),
      attackerB.consumeRecoveryCode('user-1', codes[1] as string),
    ])

    expect(resultA).toBe(true)
    expect(resultB).toBe(true)
    expect(await owner.recoveryCodesStatus('user-1')).toEqual({ total: 10, remaining: 8 })
  })

  it('the naive read-then-write it replaces really does let a code work twice', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const owner = createCredentialStore(fixture.db)
    const code = 'NAIVE0-CODE0'
    await owner.setRecoveryCodes('user-1', [await hashRecoveryCode(code)])

    const credentials = identifier(TABLES.credentials, 'sqlite')

    /** Read the row, decide in JavaScript, then write it back. The bug this file's guard exists to prevent. */
    const naiveConsume = async (handle: DatabaseHandle): Promise<boolean> => {
      const read = await handle.query<{ id: string; data: string }>(
        sql`select id, data from ${credentials} where user_id = ${'user-1'} and kind = ${'recovery_codes'} limit ${1}`,
      )
      const row = read.rows[0]
      if (row === undefined) return false
      const parsed = JSON.parse(row.data) as { codes: { hash: string; usedAt: string | null }[] }
      const entry = parsed.codes[0]
      if (entry === undefined || entry.usedAt !== null) return false

      // The gap. Both callers are here at the same time, both saw `usedAt: null`.
      await new Promise((resolve) => setTimeout(resolve, 5))

      entry.usedAt = new Date().toISOString()
      await handle.query(
        sql`update ${credentials} set data = ${JSON.stringify(parsed)} where id = ${row.id}`,
      )
      return true
    }

    const results = await Promise.all([naiveConsume(fixture.db), naiveConsume(second)])

    // Both "succeeded" — one code, two spends. This is exactly the bug the
    // compare-and-set guard in `consumeRecoveryCode` exists to prevent,
    // demonstrated rather than described.
    expect(results).toEqual([true, true])
  })
})
