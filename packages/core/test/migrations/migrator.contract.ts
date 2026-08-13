import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DatabaseHandle, identifier, sql } from '../../src/db/index.js'
import type { CogentaError } from '../../src/errors/index.js'
import { createLogger } from '../../src/logger/index.js'
import { createMigrator, type Migration } from '../../src/migrations/index.js'

const silent = createLogger({ level: 'silent' })

export interface MigratorContractHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

/**
 * The single contract suite for the migration engine, run against every dialect.
 *
 * The differences that matter here are not cosmetic: MySQL has no transactional
 * DDL, so a failed migration cannot be rolled back the way it is on Postgres and
 * SQLite. The suite asserts the behaviour that must hold everywhere and lets the
 * dialect-specific consequence be asserted where it belongs.
 */
export function runMigratorContract(
  name: string,
  create: () => Promise<MigratorContractHarness>,
): void {
  describe(`Migrator contract — ${name}`, () => {
    let harness: MigratorContractHarness
    let db: DatabaseHandle

    /** Tables this run may have created, dropped between tests. */
    const scratch = ['m_alpha', 'm_beta', 'm_gamma']

    const cleanup = async (): Promise<void> => {
      for (const table of scratch) {
        await db.query(sql`drop table if exists ${identifier(table, db.dialect)}`)
      }
      await db.query(sql`drop table if exists ${identifier('cogenta_migrations', db.dialect)}`)
      await db.query(sql`drop table if exists ${identifier('cogenta_migrations_lock', db.dialect)}`)
    }

    const migrator = (migrations: readonly Migration[], now?: () => number) =>
      createMigrator({ db, migrations, logger: silent, ...(now === undefined ? {} : { now }) })

    const alpha = (): Migration => ({
      id: '0001_alpha',
      name: 'create alpha',
      up: async (tx) => {
        await tx.query(sql`create table ${identifier('m_alpha', db.dialect)} (a integer)`)
      },
      down: async (tx) => {
        await tx.query(sql`drop table ${identifier('m_alpha', db.dialect)}`)
      },
    })

    const beta = (): Migration => ({
      id: '0002_beta',
      name: 'create beta',
      up: async (tx) => {
        await tx.query(sql`create table ${identifier('m_beta', db.dialect)} (a integer)`)
      },
      down: async (tx) => {
        await tx.query(sql`drop table ${identifier('m_beta', db.dialect)}`)
      },
    })

    const exists = async (table: string): Promise<boolean> => {
      try {
        await db.query(sql`select 1 from ${identifier(table, db.dialect)}`)
        return true
      } catch {
        return false
      }
    }

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      await cleanup()
    })

    afterEach(async () => {
      await cleanup()
      await harness.dispose?.()
      await db.close()
    })

    describe('applying', () => {
      it('runs pending migrations in id order', async () => {
        const outcomes = await migrator([beta(), alpha()]).up()

        expect(outcomes.map((outcome) => outcome.id)).toEqual(['0001_alpha', '0002_beta'])
        expect(await exists('m_alpha')).toBe(true)
        expect(await exists('m_beta')).toBe(true)
      })

      it('does nothing the second time', async () => {
        const migrations = [alpha()]
        await migrator(migrations).up()

        expect(await migrator(migrations).up()).toEqual([])
      })

      it('applies only what is new when a migration is added later', async () => {
        await migrator([alpha()]).up()
        const outcomes = await migrator([alpha(), beta()]).up()

        expect(outcomes.map((outcome) => outcome.id)).toEqual(['0002_beta'])
      })

      it('stops at the migration named by "to"', async () => {
        const outcomes = await migrator([alpha(), beta()]).up({ to: '0001_alpha' })

        expect(outcomes.map((outcome) => outcome.id)).toEqual(['0001_alpha'])
        expect(await exists('m_beta')).toBe(false)
      })

      it('records when each migration ran and how long it took', async () => {
        await migrator([alpha()]).up()
        const status = await migrator([alpha()]).status()

        expect(status[0]).toMatchObject({ id: '0001_alpha', applied: true })
        expect(status[0]?.appliedAt).toBeTruthy()
        expect(typeof status[0]?.durationMs).toBe('number')
      })

      it('creates its own tracking table on a database that has never been migrated', async () => {
        expect(await migrator([alpha()]).status()).toHaveLength(1)
      })
    })

    describe('rolling back', () => {
      it('reverts the most recent migration by default', async () => {
        const migrations = [alpha(), beta()]
        await migrator(migrations).up()

        const outcomes = await migrator(migrations).down()

        expect(outcomes.map((outcome) => outcome.id)).toEqual(['0002_beta'])
        expect(await exists('m_beta')).toBe(false)
        expect(await exists('m_alpha')).toBe(true)
      })

      it('reverts several steps, newest first', async () => {
        const migrations = [alpha(), beta()]
        await migrator(migrations).up()

        const outcomes = await migrator(migrations).down({ steps: 2 })

        expect(outcomes.map((outcome) => outcome.id)).toEqual(['0002_beta', '0001_alpha'])
        expect(await exists('m_alpha')).toBe(false)
      })

      it('forgets the migration so it can be applied again', async () => {
        const migrations = [alpha()]
        await migrator(migrations).up()
        await migrator(migrations).down()

        expect((await migrator(migrations).up()).map((outcome) => outcome.id)).toEqual([
          '0001_alpha',
        ])
      })

      it('does nothing when there is nothing applied', async () => {
        expect(await migrator([alpha()]).down()).toEqual([])
      })

      it('leaves the database as it was after up then down then up', async () => {
        const migrations = [alpha(), beta()]
        await migrator(migrations).up()
        await migrator(migrations).down({ steps: 2 })
        await migrator(migrations).up()

        expect(await exists('m_alpha')).toBe(true)
        expect(await exists('m_beta')).toBe(true)
      })
    })

    describe('destructive migrations', () => {
      const destructive = (): Migration => ({
        ...alpha(),
        destructive: true,
        impact: 'Drops the legacy column and its data.',
      })

      it('refuses to run without an explicit confirmation', async () => {
        await expect(migrator([destructive()]).up()).rejects.toMatchObject({
          code: 'MIGRATION_DESTRUCTIVE',
        })
        expect(await exists('m_alpha')).toBe(false)
      })

      it('refuses when the backup is confirmed but not verified', async () => {
        await expect(
          migrator([destructive()]).up({ confirmDestructive: true }),
        ).rejects.toMatchObject({ code: 'MIGRATION_DESTRUCTIVE' })
      })

      it('names what will be lost, so the confirmation is informed', async () => {
        try {
          await migrator([destructive()]).up()
          expect.unreachable('should have thrown')
        } catch (error) {
          expect(JSON.stringify((error as CogentaError).details)).toContain('legacy column')
        }
      })

      it('runs once both the confirmation and a verified backup are given', async () => {
        await migrator([destructive()]).up({ confirmDestructive: true, backupVerified: true })

        expect(await exists('m_alpha')).toBe(true)
      })

      it('does not block a run that contains no destructive migration', async () => {
        await expect(migrator([alpha()]).up()).resolves.toHaveLength(1)
      })
    })

    describe('an applied migration that changed', () => {
      it('is refused rather than silently re-run or ignored', async () => {
        await migrator([{ ...alpha(), checksum: 'aaa' }]).up()

        await expect(
          migrator([{ ...alpha(), checksum: 'bbb' }, beta()]).up(),
        ).rejects.toMatchObject({ code: 'MIGRATION_CHECKSUM_MISMATCH' })
      })

      it('is reported by status without throwing, so a diagnosis can run', async () => {
        await migrator([{ ...alpha(), checksum: 'aaa' }]).up()
        const status = await migrator([{ ...alpha(), checksum: 'bbb' }]).status()

        expect(status[0]?.checksumMismatch).toBe(true)
      })

      it('is accepted when the checksum is unchanged', async () => {
        const migration = { ...alpha(), checksum: 'aaa' }
        await migrator([migration]).up()

        await expect(migrator([migration]).up()).resolves.toEqual([])
      })
    })

    describe('locking', () => {
      it('refuses a second run while one is in progress', async () => {
        // The lock is taken and held by a migration that never finishes, which
        // is what a long deployment looks like from another process.
        let release = (): void => undefined
        const blocked = new Promise<void>((resolve) => {
          release = resolve
        })

        const slow: Migration = {
          id: '0001_slow',
          up: async () => blocked,
          down: async () => undefined,
        }

        const running = migrator([slow]).up()
        await new Promise((resolve) => setTimeout(resolve, 50))

        await expect(migrator([alpha()]).up()).rejects.toMatchObject({ code: 'MIGRATION_LOCKED' })

        release()
        await running
      })

      it('releases the lock even when a migration fails', async () => {
        const broken: Migration = {
          id: '0001_broken',
          up: async (tx) => {
            await tx.query(sql`this is not sql`)
          },
          down: async () => undefined,
        }

        await expect(migrator([broken]).up()).rejects.toThrowError()

        // The next run must not be blocked by the lock of the failed one.
        await expect(migrator([alpha()]).up()).resolves.toHaveLength(1)
      })

      it('takes over a lock left behind by a process that died', async () => {
        const clock = { value: 1_700_000_000_000 }
        const stalled: Migration = {
          id: '0001_x',
          up: async () => undefined,
          down: async () => undefined,
        }

        // Simulate a crashed run by taking the lock and never releasing it.
        await createMigrator({ db, migrations: [], logger: silent }).status()
        await db.query(
          sql`insert into ${identifier('cogenta_migrations_lock', db.dialect)} (id, acquired_at, owner)
              values (${1}, ${new Date(clock.value - 60 * 60 * 1000).toISOString()}, ${'dead-process'})`,
        )

        await expect(migrator([stalled], () => clock.value).up()).resolves.toHaveLength(1)
      })
    })

    describe('a migration that fails', () => {
      it('reports which migration failed and in which direction', async () => {
        const broken: Migration = {
          id: '0001_broken',
          up: async (tx) => {
            await tx.query(sql`this is not sql`)
          },
          down: async () => undefined,
        }

        await expect(migrator([broken]).up()).rejects.toMatchObject({
          code: 'MIGRATION_FAILED',
          details: { id: '0001_broken', direction: 'up' },
        })
      })

      it('does not record a failed migration as applied', async () => {
        const broken: Migration = {
          id: '0001_broken',
          up: async (tx) => {
            await tx.query(sql`this is not sql`)
          },
          down: async () => undefined,
        }

        await migrator([broken])
          .up()
          .catch(() => undefined)
        const status = await migrator([broken]).status()

        expect(status[0]?.applied).toBe(false)
      })

      it('stops the run rather than carrying on to the next migration', async () => {
        const broken: Migration = {
          id: '0001_broken',
          up: async (tx) => {
            await tx.query(sql`this is not sql`)
          },
          down: async () => undefined,
        }

        await migrator([broken, beta()])
          .up()
          .catch(() => undefined)

        expect(await exists('m_beta')).toBe(false)
      })

      it('says whether the schema was rolled back, because MySQL cannot', async () => {
        const broken: Migration = {
          id: '0001_broken',
          up: async (tx) => {
            await tx.query(sql`this is not sql`)
          },
          down: async () => undefined,
        }

        try {
          await migrator([broken]).up()
          expect.unreachable('should have thrown')
        } catch (error) {
          const rolledBack = (error as CogentaError).details?.['rolledBack']
          expect(rolledBack).toBe(db.dialect !== 'mysql')
        }
      })
    })

    describe('bad input', () => {
      it('refuses two migrations with the same id', () => {
        expect(() => migrator([alpha(), { ...beta(), id: '0001_alpha' }])).toThrowError(
          /0001_alpha/,
        )
      })

      it('refuses a "to" that names no migration', async () => {
        await expect(migrator([alpha()]).up({ to: 'nope' })).rejects.toThrowError(/nope/)
      })
    })
  })
}
