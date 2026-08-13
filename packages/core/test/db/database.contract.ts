import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { identifier, sql, unsafeRaw } from '../../src/db/dialect.js'
import type { DatabaseHandle } from '../../src/db/index.js'

export interface DatabaseContractHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

/**
 * The single contract suite for `DatabaseHandle`.
 *
 * The point of this file is the L0 acceptance criterion: **the three databases
 * pass the same integration suite**. Anything a caller would have to write
 * differently per dialect belongs in the db layer, and a divergence shows up
 * here rather than in production on the dialect nobody develops against.
 */
export function runDatabaseContract(
  name: string,
  create: () => Promise<DatabaseContractHarness>,
): void {
  describe(`DatabaseHandle contract — ${name}`, () => {
    let harness: DatabaseContractHarness
    let db: DatabaseHandle

    /** Auto-increment differs per dialect; the db layer hides it behind this. */
    const idColumn = (dialect: string): string => {
      if (dialect === 'postgres') return 'id integer generated always as identity primary key'
      if (dialect === 'mysql') return 'id integer auto_increment primary key'
      return 'id integer primary key autoincrement'
    }

    beforeEach(async () => {
      harness = await create()
      db = harness.db

      await db.query(sql`drop table if exists ${identifier('contract_items', db.dialect)}`)
      await db.query(
        sql`create table ${identifier('contract_items', db.dialect)} (
          ${unsafeRaw(idColumn(db.dialect))},
          name varchar(200) not null,
          active ${unsafeRaw(db.dialect === 'postgres' ? 'boolean' : 'tinyint')} not null,
          payload text,
          created_at ${unsafeRaw(db.dialect === 'postgres' ? 'timestamptz' : 'datetime')}
        )`,
      )
    })

    afterEach(async () => {
      await db.query(sql`drop table if exists ${identifier('contract_items', db.dialect)}`)
      await harness.dispose?.()
      await db.close()
    })

    describe('queries', () => {
      it('reads back what it wrote', async () => {
        await db.query(sql`insert into contract_items (name, active) values (${'first'}, ${true})`)

        const result = await db.query<{ name: string }>(sql`select name from contract_items`)
        expect(result.rows).toHaveLength(1)
        expect(result.rows[0]?.name).toBe('first')
      })

      it('reports how many rows a write touched', async () => {
        await db.query(sql`insert into contract_items (name, active) values (${'a'}, ${true})`)
        await db.query(sql`insert into contract_items (name, active) values (${'b'}, ${true})`)

        const updated = await db.query(sql`update contract_items set name = ${'c'}`)
        expect(updated.rowsAffected).toBe(2)
      })

      it('returns no rows and no error for a read that matches nothing', async () => {
        const result = await db.query(sql`select * from contract_items where name = ${'absent'}`)

        expect(result.rows).toEqual([])
      })

      it('binds parameters rather than interpolating them', async () => {
        const hostile = "'; drop table contract_items;--"
        await db.query(sql`insert into contract_items (name, active) values (${hostile}, ${true})`)

        // The table still exists and holds the string verbatim.
        const result = await db.query<{ name: string }>(sql`select name from contract_items`)
        expect(result.rows[0]?.name).toBe(hostile)
      })

      it('round-trips text with quotes, Unicode and newlines', async () => {
        const awkward = 'L\'été — "guillemets"\nligne 2\t日本語'
        await db.query(sql`insert into contract_items (name, active) values (${awkward}, ${true})`)

        const result = await db.query<{ name: string }>(sql`select name from contract_items`)
        expect(result.rows[0]?.name).toBe(awkward)
      })

      it('stores a boolean the same way on every dialect', async () => {
        await db.query(sql`insert into contract_items (name, active) values (${'on'}, ${true})`)
        await db.query(sql`insert into contract_items (name, active) values (${'off'}, ${false})`)

        const result = await db.query<{ name: string }>(
          sql`select name from contract_items where active = ${true}`,
        )
        expect(result.rows.map((row) => row.name)).toEqual(['on'])
      })

      it('stores an object as JSON text without the caller encoding it', async () => {
        await db.query(
          sql`insert into contract_items (name, active, payload)
              values (${'json'}, ${true}, ${{ tags: ['a', 'b'] }})`,
        )

        const result = await db.query<{ payload: string }>(sql`select payload from contract_items`)
        expect(JSON.parse(result.rows[0]?.payload ?? '')).toEqual({ tags: ['a', 'b'] })
      })

      it('treats undefined as null', async () => {
        await db.query(
          sql`insert into contract_items (name, active, payload) values (${'n'}, ${true}, ${undefined})`,
        )

        const result = await db.query<{ payload: string | null }>(
          sql`select payload from contract_items`,
        )
        expect(result.rows[0]?.payload).toBeNull()
      })

      it('reports a broken statement as a typed error, not a raw driver error', async () => {
        await expect(db.query(sql`select * from table_that_does_not_exist`)).rejects.toMatchObject({
          name: 'CogentaError',
        })
      })

      it('never puts parameter values in the error, because they carry personal data', async () => {
        try {
          await db.query(sql`insert into nope (email) values (${'someone@example.com'})`)
          expect.unreachable('should have thrown')
        } catch (error) {
          expect(JSON.stringify(error)).not.toContain('someone@example.com')
        }
      })
    })

    describe('transactions', () => {
      it('commits everything when the callback returns', async () => {
        await db.transaction(async (tx) => {
          await tx.query(sql`insert into contract_items (name, active) values (${'a'}, ${true})`)
          await tx.query(sql`insert into contract_items (name, active) values (${'b'}, ${true})`)
        })

        const result = await db.query(sql`select * from contract_items`)
        expect(result.rows).toHaveLength(2)
      })

      it('rolls everything back when the callback throws', async () => {
        await expect(
          db.transaction(async (tx) => {
            await tx.query(sql`insert into contract_items (name, active) values (${'a'}, ${true})`)
            throw new Error('changed my mind')
          }),
        ).rejects.toThrowError('changed my mind')

        const result = await db.query(sql`select * from contract_items`)
        expect(result.rows).toEqual([])
      })

      it('returns the callback result', async () => {
        expect(await db.transaction(async () => 'value')).toBe('value')
      })

      it('rolls back the inner work only, when transactions nest', async () => {
        await db.transaction(async (tx) => {
          await tx.query(
            sql`insert into contract_items (name, active) values (${'outer'}, ${true})`,
          )

          await expect(
            db.transaction(async (inner) => {
              await inner.query(
                sql`insert into contract_items (name, active) values (${'inner'}, ${true})`,
              )
              throw new Error('inner failed')
            }),
          ).rejects.toThrowError('inner failed')
        })

        const result = await db.query<{ name: string }>(sql`select name from contract_items`)
        expect(result.rows.map((row) => row.name)).toEqual(['outer'])
      })

      it('takes the write lock up front when asked to', async () => {
        // On SQLite a deferred transaction that reads then writes can lose the
        // lock in between; every read-modify-write needs this.
        await db.transaction(
          async (tx) => {
            await tx.query(sql`select * from contract_items`)
            await tx.query(sql`insert into contract_items (name, active) values (${'x'}, ${true})`)
          },
          { immediate: true },
        )

        expect((await db.query(sql`select * from contract_items`)).rows).toHaveLength(1)
      })

      it('leaves the connection usable after a rollback', async () => {
        await expect(
          db.transaction(async () => {
            throw new Error('boom')
          }),
        ).rejects.toThrowError()

        await db.query(sql`insert into contract_items (name, active) values (${'after'}, ${true})`)
        expect((await db.query(sql`select * from contract_items`)).rows).toHaveLength(1)
      })
    })
  })
}
