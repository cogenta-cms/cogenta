import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger, createSqliteHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * Contract E's back office (ADR-0024), wired into a real `cogenta serve` for
 * the first time. `@cogenta/commerce`'s own suite proves the store logic;
 * this file proves only that `/api/commerce` is actually reachable, that its
 * own permission vocabulary (`commerce.*`, never contract A's five actions)
 * is enforced by a real server, and that a product created through it is
 * immediately listable and sellable through the same router — the same
 * pattern `serve-marketplace.test.ts` and `serve-taxonomies-trash.test.ts`
 * already use for their own routers.
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'

async function project(options: { readonly billing?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-commerce-'))

  const billing = options.billing ?? false

  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  ${billing ? "billing: { legalName: 'Test Shop Ltd', address: ['1 Market Street', 'Testville'], taxId: 'FR12345678900', footer: 'Payment due on receipt.' }," : ''}
}
`,
    'utf8',
  )

  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')

  return root
}

/**
 * Seeds a paid order directly through the real commerce stores — there is no
 * public checkout endpoint mounted by `cogenta serve` (checkout is proven at
 * `@cogenta/commerce`'s own level; only the back office is HTTP here), so this
 * is the same shortcut `serve-commerce.test.ts`'s sibling suites take to reach
 * a state the admin router can then act on for real, over a real socket.
 */
async function seedPaidOrder(root: string): Promise<string> {
  const {
    createCatalogStore,
    createCartStore,
    createCustomerStore,
    createOrderStore,
    createPaymentStore,
    createTaxStore,
    createShippingStore,
    createCouponStore,
    createManualPaymentGateway,
    ensureCommerceTables,
  } = await import('@cogenta/commerce')

  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureCommerceTables(db)
  const catalog = createCatalogStore(db)
  const tax = createTaxStore(db)
  const shipping = createShippingStore(db)
  const coupons = createCouponStore(db)
  const customers = createCustomerStore(db)
  const carts = createCartStore(db, { catalog, tax, shipping, coupons })
  const orders = createOrderStore(db, { catalog, carts, customers, coupons })
  const payments = createPaymentStore(db, { gateway: createManualPaymentGateway(), orders })

  const product = await catalog.createProduct({ handle: 'seed-product', title: 'Seed product' })
  const variant = await catalog.createVariant({
    productId: product.id,
    sku: 'SEED-1',
    title: 'Seed variant',
    priceMinor: 2000,
    currency: 'EUR',
    onHand: 10,
  })
  const cart = await carts.open({ currency: 'EUR', sessionKey: 'seed' })
  await carts.addLine(cart.id, variant.id, 1)
  const placed = await orders.place({ cartId: cart.id, email: 'buyer@example.com' })
  if (placed.kind !== 'placed') throw new Error('expected the seed order to place')
  const payment = await payments.start(placed.order.id)
  await payments.settle(payment.id, { actorId: null })

  await db.close()
  return placed.order.id
}

const activeServers: AbortController[] = []

async function startServer(root: string): Promise<{ base: string; stop: () => Promise<void> }> {
  const controller = new AbortController()
  activeServers.push(controller)

  let resolveAddress: (value: { port: number; host: string }) => void
  const address = new Promise<{ port: number; host: string }>((resolve) => {
    resolveAddress = resolve
  })

  const done = runServe({
    cwd: root,
    env: { COGENTA_AUTH_SIGNING_KEY: SIGNING_KEY },
    logger: createLogger({ level: 'silent' }),
    out: createOutput(() => undefined, false),
    stderr: () => undefined,
    port: 0,
    signal: controller.signal,
    onListening: (a) => resolveAddress(a),
  })

  const bound = await Promise.race([
    address,
    done.then((code) => {
      throw new Error(`runServe exited with code ${code} before it started listening`)
    }),
  ])

  return {
    base: `http://${bound.host}:${bound.port}`,
    stop: async () => {
      controller.abort()
      await done
    },
  }
}

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function signIn(root: string, base: string, roles: readonly string[]): Promise<string> {
  const { createSqliteHandle } = await import('@cogenta/core')
  const { createUserStore, createCredentialStore, ensureAuthTables } = await import('@cogenta/auth')

  const email = `${roles.join('-')}@example.com`
  const password = 'correct horse battery staple'

  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureAuthTables(db)
  const user = await createUserStore(db).create({ email, roles: [...roles] })
  await createCredentialStore(db).setPassword(user.id, password)
  await db.close()

  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await response.json()) as { data: { session?: { token: string } } }
  const token = body.data.session?.token
  if (token === undefined) throw new Error('expected a session')
  return token
}

describe('the shop, end to end', () => {
  it('answers an admin with the empty catalog, real router and real tables', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])

    const response = await fetch(`${server.base}/api/commerce/products`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { products: unknown[] }
    expect(body.products).toEqual([])
  })

  it('lists a product created through the admin router, with its variant and stock', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])
    const authHeaders = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    }

    const createProduct = await fetch(`${server.base}/api/commerce/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ handle: 'wool-jumper', title: 'Wool jumper' }),
    })
    expect(createProduct.status).toBe(201)
    const product = (await createProduct.json()) as { id: string }

    const createVariant = await fetch(
      `${server.base}/api/commerce/products/${product.id}/variants`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          sku: 'WOOL-JUMPER-M',
          title: 'Medium',
          priceMinor: 4500,
          currency: 'EUR',
          onHand: 12,
        }),
      },
    )
    expect(createVariant.status).toBe(201)

    // Listable: what an admin screen renders as the product table.
    const list = await fetch(`${server.base}/api/commerce/products`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const listBody = (await list.json()) as {
      products: readonly { id: string; handle: string; title: string }[]
    }
    expect(listBody.products).toHaveLength(1)
    expect(listBody.products[0]).toMatchObject({ handle: 'wool-jumper', title: 'Wool jumper' })

    // Sellable: the variant, its price in minor units, and its stock are all
    // reachable through the same router — what an order would be placed
    // against.
    const read = await fetch(`${server.base}/api/commerce/products/${product.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const readBody = (await read.json()) as {
      variants: readonly { sku: string; priceMinor: number; onHand: number }[]
    }
    expect(readBody.variants).toHaveLength(1)
    expect(readBody.variants[0]).toMatchObject({
      sku: 'WOOL-JUMPER-M',
      priceMinor: 4500,
      onHand: 12,
    })
  })

  it('refuses an actor without catalog-write, never a UI-only gate', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['viewer'])

    const response = await fetch(`${server.base}/api/commerce/products`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ handle: 'x', title: 'X' }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses an anonymous request, telling "sign in" apart from "not allowed"', async () => {
    const root = await project()
    const server = await startServer(root)

    const response = await fetch(`${server.base}/api/commerce/products`)
    expect(response.status).toBe(401)
  })

  it('adds a second variant to a product and removes it again, both over the real router', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])
    const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const createProduct = await fetch(`${server.base}/api/commerce/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ handle: 't-shirt', title: 'T-shirt' }),
    })
    const product = (await createProduct.json()) as { id: string }

    const small = await fetch(`${server.base}/api/commerce/products/${product.id}/variants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sku: 'TSHIRT-S',
        title: 'Small',
        priceMinor: 1500,
        currency: 'EUR',
        onHand: 5,
      }),
    })
    expect(small.status).toBe(201)

    const large = await fetch(`${server.base}/api/commerce/products/${product.id}/variants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sku: 'TSHIRT-L',
        title: 'Large',
        priceMinor: 1600,
        currency: 'EUR',
        onHand: 3,
      }),
    })
    expect(large.status).toBe(201)
    const largeVariant = (await large.json()) as { id: string }

    const afterCreate = await fetch(`${server.base}/api/commerce/products/${product.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const afterCreateBody = (await afterCreate.json()) as { variants: readonly { sku: string }[] }
    expect(afterCreateBody.variants.map((v) => v.sku).sort()).toEqual(['TSHIRT-L', 'TSHIRT-S'])

    const remove = await fetch(`${server.base}/api/commerce/variants/${largeVariant.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(remove.status).toBe(204)

    const afterDelete = await fetch(`${server.base}/api/commerce/products/${product.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const afterDeleteBody = (await afterDelete.json()) as { variants: readonly { sku: string }[] }
    expect(afterDeleteBody.variants.map((v) => v.sku)).toEqual(['TSHIRT-S'])
  })

  it('creates a coupon through the admin and finds it again on the real listing', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])

    const create = await fetch(`${server.base}/api/commerce/coupons`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'summer25', kind: 'percentage', value: 2500 }),
    })
    expect(create.status).toBe(201)
    const created = (await create.json()) as { code: string }
    expect(created.code).toBe('SUMMER25')

    const list = await fetch(`${server.base}/api/commerce/coupons`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const listBody = (await list.json()) as {
      coupons: readonly { code: string; active: boolean }[]
    }
    expect(listBody.coupons).toHaveLength(1)
    expect(listBody.coupons[0]).toMatchObject({ code: 'SUMMER25', active: true })

    const deactivate = await fetch(`${server.base}/api/commerce/coupons/SUMMER25/deactivate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(deactivate.status).toBe(204)

    const afterDeactivate = await fetch(`${server.base}/api/commerce/coupons`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const afterDeactivateBody = (await afterDeactivate.json()) as {
      coupons: readonly { active: boolean }[]
    }
    expect(afterDeactivateBody.coupons[0]?.active).toBe(false)
  })

  it('refuses a coupon write from a role with only commerce.read', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['viewer'])

    const response = await fetch(`${server.base}/api/commerce/coupons`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'nope', kind: 'fixed', value: 100, currency: 'EUR' }),
    })
    expect(response.status).toBe(403)
  })

  it('issues an invoice for a paid order and serves back a real, downloadable PDF', async () => {
    const root = await project({ billing: true })
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])
    const orderId = await seedPaidOrder(root)

    const issue = await fetch(`${server.base}/api/commerce/orders/${orderId}/invoice`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(issue.status).toBe(201)
    const invoice = (await issue.json()) as { id: string; orderId: string; number: string }
    expect(invoice.orderId).toBe(orderId)
    expect(invoice.number).toMatch(/^\d{4}-\d{6}$/u)

    // Recoverable by the same route the "issue invoice" button reads back
    // from — the whole point of this test.
    const read = await fetch(`${server.base}/api/commerce/orders/${orderId}/invoice`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(read.status).toBe(200)
    const readBody = (await read.json()) as { number: string }
    expect(readBody.number).toBe(invoice.number)

    const pdf = await fetch(`${server.base}/api/commerce/orders/${orderId}/invoice/pdf`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    const bytes = new Uint8Array(await pdf.arrayBuffer())
    // A real PDF, not a stub: the format's own magic bytes at the start.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(200)
  })

  it('leaves invoicing unreachable when the site has no seller details configured', async () => {
    const root = await project({ billing: false })
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])
    const orderId = await seedPaidOrder(root)

    const issue = await fetch(`${server.base}/api/commerce/orders/${orderId}/invoice`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(issue.status).toBe(404)
    const body = (await issue.json()) as { error: { code: string } }
    expect(body.error.code).toBe('COMMERCE_INVOICE_NOT_FOUND')
  })

  it('lists a subscription seeded like checkout would and cancels it through the admin', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])

    const { createSubscriptionStore, ...stores } = await import('@cogenta/commerce')
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    await stores.ensureCommerceTables(db)
    const catalog = stores.createCatalogStore(db)
    const customers = stores.createCustomerStore(db)
    const tax = stores.createTaxStore(db)
    const shipping = stores.createShippingStore(db)
    const coupons = stores.createCouponStore(db)
    const carts = stores.createCartStore(db, { catalog, tax, shipping, coupons })
    const orders = stores.createOrderStore(db, { catalog, carts, customers, coupons })
    const payments = stores.createPaymentStore(db, {
      gateway: stores.createManualPaymentGateway(),
      orders,
    })
    const subscriptions = createSubscriptionStore(db, { catalog, customers, orders, payments })

    const product = await catalog.createProduct({ handle: 'coffee', title: 'Coffee' })
    const variant = await catalog.createVariant({
      productId: product.id,
      sku: 'COFFEE-BAG',
      title: 'Coffee bag',
      priceMinor: 1200,
      currency: 'EUR',
      onHand: 50,
    })
    const customer = await customers.ensure('subscriber@example.com')
    const subscription = await subscriptions.create({
      customerId: customer.id,
      variantId: variant.id,
      intervalUnit: 'month',
    })
    await db.close()

    const list = await fetch(`${server.base}/api/commerce/subscriptions`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(list.status).toBe(200)
    const listBody = (await list.json()) as {
      subscriptions: readonly { id: string; status: string }[]
    }
    expect(listBody.subscriptions.map((s) => s.id)).toContain(subscription.id)

    const cancel = await fetch(
      `${server.base}/api/commerce/subscriptions/${subscription.id}/cancel`,
      { method: 'POST', headers: { authorization: `Bearer ${token}` } },
    )
    expect(cancel.status).toBe(200)
    const cancelled = (await cancel.json()) as { status: string }
    expect(cancelled.status).toBe('cancelled')

    const afterCancel = await fetch(`${server.base}/api/commerce/subscriptions?status=cancelled`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const afterCancelBody = (await afterCancel.json()) as {
      subscriptions: readonly { id: string }[]
    }
    expect(afterCancelBody.subscriptions.map((s) => s.id)).toContain(subscription.id)
  })
})
