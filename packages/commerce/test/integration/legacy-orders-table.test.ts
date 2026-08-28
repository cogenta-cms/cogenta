import process from 'node:process'
import {
  createMysqlHandle,
  createPostgresHandle,
  type DatabaseHandle,
  identifier,
  sql,
  unsafeRaw,
} from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createOrderStore } from '../../src/order/store.js'
import { ensureCommerceTables } from '../../src/tables.js'
import { createShop } from '../helpers/shop.js'

/**
 * The same up/up-again proof as `legacy-orders-table.test.ts` (SQLite unit
 * test), against the real servers. `alter table … add column` is one of the
 * few pieces of DDL the three dialects are *not* guaranteed to agree on
 * (see `tables.ts`'s own header comment on why `create index if not exists`
 * gets the same "run it for real" treatment) — a nullable-column add is low
 * risk, but "low risk" is exactly the kind of claim this project does not
 * make untested (R1's own discipline, applied to a migration path rather
 * than a driver).
 *
 * A missing service is skipped **loudly** — see `catalog.test.ts` in this
 * same directory for the convention this file reuses verbatim.
 */

const postgresUrl = process.env['COGENTA_TEST_POSTGRES_URL']
const mysqlUrl = process.env['COGENTA_TEST_MYSQL_URL']
const mariadbUrl = process.env['COGENTA_TEST_MARIADB_URL']

const missing = (label: string, variable: string): void => {
  describe.skip(`cogenta_commerce_orders predating fiche 52 — ${label}`, () => {
    it(`skipped: ${variable} is not set — run \`pnpm services:up\``, () => undefined)
  })
}

function run(label: string, connect: () => Promise<DatabaseHandle>): void {
  describe(`cogenta_commerce_orders predating fiche 52 — ${label}`, () => {
    it('adds the address and tracking columns in place, without losing existing rows', async () => {
      const db = await connect()
      const d = db.dialect
      const orders = identifier('cogenta_commerce_orders', d)

      try {
        await db.query(sql`drop table if exists ${orders}`)
        // The pre-fiche-52 shape, built by hand for the same reason the
        // SQLite unit test does: testing a migration against the shape it
        // is meant to produce proves nothing.
        const text = (length: number) => (d === 'postgres' ? 'text' : `varchar(${length})`)
        await db.query(sql`
          create table ${orders} (
            id ${unsafeRaw(text(64))} not null primary key,
            reference ${unsafeRaw(text(64))} not null unique,
            customer_id ${unsafeRaw(text(64))},
            email ${unsafeRaw(text(255))} not null,
            status ${unsafeRaw(text(64))} not null,
            currency ${unsafeRaw(text(8))} not null,
            subtotal_minor bigint not null,
            discount_minor bigint not null,
            shipping_minor bigint not null,
            tax_minor bigint not null,
            total_minor bigint not null,
            coupon_code ${unsafeRaw(text(64))},
            shipping_country ${unsafeRaw(text(8))},
            shipping_region ${unsafeRaw(text(64))},
            shipping_method_id ${unsafeRaw(text(64))},
            shipping_method_label ${unsafeRaw(text(255))},
            placed_at ${unsafeRaw(text(64))} not null,
            updated_at ${unsafeRaw(text(64))} not null,
            subscription_id ${unsafeRaw(text(64))}
          )`)
        await db.query(sql`
          insert into ${orders}
            (id, reference, customer_id, email, status, currency, subtotal_minor, discount_minor,
             shipping_minor, tax_minor, total_minor, coupon_code, shipping_country, shipping_region,
             shipping_method_id, shipping_method_label, placed_at, updated_at, subscription_id)
          values
            ('order-legacy', 'ORD-LEGACY', ${null}, 'legacy@example.com', 'pending', 'EUR', ${1000}, ${0},
             ${0}, ${0}, ${1000}, ${null}, 'FR', ${null}, ${null}, ${null}, '2025-01-01T00:00:00.000Z',
             '2025-01-01T00:00:00.000Z', ${null})`)

        await ensureCommerceTables(db)

        const store = createOrderStore(db, createShop(db))
        const order = await store.read('order-legacy')
        expect(order).not.toBeNull()
        expect(order?.reference).toBe('ORD-LEGACY')
        expect(order?.totalMinor).toBe(1000)
        expect(order?.shippingAddressLine1).toBeNull()
        expect(order?.trackingCarrier).toBeNull()

        const updated = await store.update('order-legacy', {
          shippingAddress: { line1: '1 rue de Rivoli', city: 'Paris', postalCode: '75001' },
        })
        expect(updated.shippingAddressLine1).toBe('1 rue de Rivoli')
      } finally {
        await db.query(sql`drop table if exists ${orders}`).catch(() => undefined)
        await db.close()
      }
    })
  })
}

if (postgresUrl === undefined || postgresUrl === '') {
  missing('postgres', 'COGENTA_TEST_POSTGRES_URL')
} else {
  run('postgres', () => createPostgresHandle({ url: postgresUrl, poolSize: 3 }))
}

if (mysqlUrl === undefined || mysqlUrl === '') {
  missing('mysql', 'COGENTA_TEST_MYSQL_URL')
} else {
  run('mysql', () => createMysqlHandle({ url: mysqlUrl, poolSize: 3 }))
}

if (mariadbUrl === undefined || mariadbUrl === '') {
  missing('mariadb', 'COGENTA_TEST_MARIADB_URL')
} else {
  run('mariadb', () => createMysqlHandle({ url: mariadbUrl, poolSize: 3 }))
}
