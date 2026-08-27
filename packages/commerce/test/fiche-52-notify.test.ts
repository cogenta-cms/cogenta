import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createOrderEmailQueue, MAX_ATTEMPTS } from '../src/order/notify.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * Fiche 52 task 2: transactional order e-mails — a queue with retry, and a
 * journal visible on the order (its own history, via `OrderStore.record`).
 */

describe('order e-mail queue (task 2)', () => {
  let db: DatabaseHandle
  let shop: Shop

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
  })

  afterEach(async () => {
    await db.close()
  })

  async function seedOrder(): Promise<string> {
    const product = await shop.catalog.createProduct({ handle: 'scarf', title: 'Scarf' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'SCARF-1',
      title: 'Scarf',
      priceMinor: 1500,
      currency: 'EUR',
      onHand: 10,
    })
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'n1' })
    await shop.carts.addLine(cart.id, variant.id, 1)
    const outcome = await shop.orders.place({ cartId: cart.id, email: 'buyer@example.com' })
    if (outcome.kind !== 'placed') throw new Error('expected placed')
    return outcome.order.id
  }

  it('sends a queued confirmation e-mail and notes it on the order history', async () => {
    const sent: readonly { to: string; subject: string }[] = []
    const sentMutable = [...sent]
    const queue = createOrderEmailQueue(db, {
      orders: shop.orders,
      transport: {
        send: async (email) => {
          sentMutable.push({ to: email.to, subject: email.subject })
          return { messageId: 'msg-1' }
        },
      },
    })

    const orderId = await seedOrder()
    const queued = await queue.enqueue(orderId, 'confirmation')
    expect(queued.status).toBe('pending')

    const result = await queue.flushDue()
    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(sentMutable).toHaveLength(1)
    expect(sentMutable[0]?.to).toBe('buyer@example.com')
    expect(sentMutable[0]?.subject).toContain('Order confirmation')

    const records = await queue.listForOrder(orderId)
    expect(records[0]?.status).toBe('sent')
    expect(records[0]?.sentAt).not.toBeNull()

    const history = await shop.orders.history(orderId)
    expect(history.some((event) => event.note?.includes('Confirmation') ?? false)).toBe(true)
  })

  it('retries a transient failure, and gives up after the retry cap', async () => {
    let attempts = 0
    const queue = createOrderEmailQueue(db, {
      orders: shop.orders,
      transport: {
        send: async () => {
          attempts += 1
          throw new Error('SMTP temporarily unavailable')
        },
      },
    })

    const orderId = await seedOrder()
    await queue.enqueue(orderId, 'confirmation')

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const result = await queue.flushDue()
      expect(result.failed).toBe(1)
    }
    expect(attempts).toBe(MAX_ATTEMPTS)

    const records = await queue.listForOrder(orderId)
    expect(records[0]?.status).toBe('failed')
    expect(records[0]?.attempts).toBe(MAX_ATTEMPTS)
    expect(records[0]?.lastError).toContain('SMTP')

    // Given up: a further flush does not retry it again.
    const after = await queue.flushDue()
    expect(after).toEqual({ sent: 0, failed: 0 })

    const history = await shop.orders.history(orderId)
    expect(history.some((event) => event.note?.includes('failed after') ?? false)).toBe(true)
  })

  it('sends a shipment notice with the tracking information', async () => {
    const sent: { subject: string; text: string }[] = []
    const queue = createOrderEmailQueue(db, {
      orders: shop.orders,
      transport: {
        send: async (email) => {
          sent.push({ subject: email.subject, text: email.text })
          return { messageId: 'msg-2' }
        },
      },
    })

    const orderId = await seedOrder()
    const payment = await shop.payments.start(orderId)
    await shop.payments.settle(payment.id)
    await shop.orders.setTracking(orderId, { carrier: 'DHL', number: 'DHL42' })

    await queue.enqueue(orderId, 'shipment')
    await queue.flushDue()

    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toContain('shipped')
    expect(sent[0]?.text).toContain('DHL')
    expect(sent[0]?.text).toContain('DHL42')
  })
})
