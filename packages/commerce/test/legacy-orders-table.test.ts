import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle, sql } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createOrderStore } from '../src/order/store.js'
import { ensureCommerceTables } from '../src/tables.js'
import { createShop } from './helpers/shop.js'

/**
 * Fiche 52 tasks 1 and 4: the six address columns and the four tracking
 * columns were added to `cogenta_commerce_orders` after real sites may
 * already have created it. `ensureCommerceTables` handles that the same way
 * `menu-tables.ts`'s `location` column and `theme-store.ts`'s `active_theme`
 * do: `alter table … add column`, failure swallowed (see `tables.ts`'s own
 * comment for why that is correct here and not a `write-migration`-style
 * up/down pair — there is no "down" for an additive, nullable column).
 *
 * This is the up/up-again proof: a table built by hand, at the exact shape
 * `ensureCommerceTables` produced *before* this fiche, survives a second
 * call unharmed and gains real, usable columns.
 */
describe('cogenta_commerce_orders predating fiche 52', () => {
  let directory: string
  let legacyDb: DatabaseHandle

  afterEach(async () => {
    await legacyDb.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('adds the address and tracking columns in place, without losing existing rows', async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-commerce-legacy-'))
    legacyDb = await createSqliteHandle({ url: join(directory, 'legacy.db') })

    // The pre-fiche-52 shape of cogenta_commerce_orders, built by hand —
    // testing a migration against the shape it is meant to produce proves
    // nothing (ADR-0022's own lesson, restated here for this table).
    await legacyDb.query(sql`
      create table cogenta_commerce_orders (
        id text not null primary key,
        reference text not null unique,
        customer_id text,
        email text not null,
        status text not null,
        currency text not null,
        subtotal_minor bigint not null,
        discount_minor bigint not null,
        shipping_minor bigint not null,
        tax_minor bigint not null,
        total_minor bigint not null,
        coupon_code text,
        shipping_country text,
        shipping_region text,
        shipping_method_id text,
        shipping_method_label text,
        placed_at text not null,
        updated_at text not null,
        subscription_id text
      )`)
    await legacyDb.query(sql`
      insert into cogenta_commerce_orders
        (id, reference, customer_id, email, status, currency, subtotal_minor, discount_minor,
         shipping_minor, tax_minor, total_minor, coupon_code, shipping_country, shipping_region,
         shipping_method_id, shipping_method_label, placed_at, updated_at, subscription_id)
      values
        ('order-legacy', 'ORD-LEGACY', null, 'legacy@example.com', 'pending', 'EUR', 1000, 0,
         0, 0, 1000, null, 'FR', null, null, null, '2025-01-01T00:00:00.000Z',
         '2025-01-01T00:00:00.000Z', null)`)

    // Every other table this function owns must exist too, or `createOrderStore`
    // below (which reads order_events/order_lines) cannot work at all.
    await ensureCommerceTables(legacyDb)

    const orders = createOrderStore(legacyDb, createShop(legacyDb))
    const order = await orders.read('order-legacy')
    expect(order).not.toBeNull()
    // The pre-existing row survived, untouched.
    expect(order?.reference).toBe('ORD-LEGACY')
    expect(order?.email).toBe('legacy@example.com')
    expect(order?.totalMinor).toBe(1000)
    // The new columns default to null on a row that predates them.
    expect(order?.shippingAddressLine1).toBeNull()
    expect(order?.trackingCarrier).toBeNull()
    expect(order?.shippedAt).toBeNull()

    // And the columns are not just present — they are fully usable: a real
    // write through the store reaches them.
    const updated = await orders.update('order-legacy', {
      shippingAddress: { line1: '1 rue de Rivoli', city: 'Paris', postalCode: '75001' },
    })
    expect(updated.shippingAddressLine1).toBe('1 rue de Rivoli')
  })

  it('running ensureCommerceTables twice on an up-to-date table is a harmless no-op', async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-commerce-fresh-'))
    legacyDb = await createSqliteHandle({ url: join(directory, 'fresh.db') })
    await ensureCommerceTables(legacyDb)
    await expect(ensureCommerceTables(legacyDb)).resolves.toBeUndefined()
  })
})
