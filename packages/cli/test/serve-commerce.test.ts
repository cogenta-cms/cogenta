import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
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

async function startServer(
  root: string,
  extra: { readonly commerceEmailTickMs?: number } = {},
): Promise<{ base: string; stop: () => Promise<void> }> {
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
    ...(extra.commerceEmailTickMs === undefined
      ? {}
      : { commerceEmailTickMs: extra.commerceEmailTickMs }),
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

/**
 * Polls the real `FileEmailTransport` directory until at least `count`
 * messages have landed, or gives up — the retry queue's tick is real and
 * asynchronous (`commerceEmailTickMs`), so this is the same "wait for a real
 * side effect" idiom the trash/forms-purge tick tests already use, just over
 * the filesystem instead of a store read.
 */
async function waitForMail(directory: string, count: number): Promise<readonly string[]> {
  const deadline = Date.now() + 5000
  for (;;) {
    const files = await readdir(directory).catch(() => [])
    if (files.length >= count) {
      return Promise.all(files.map((file) => readFile(join(directory, file), 'utf8')))
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Expected at least ${String(count)} e-mail(s) in ${directory}, found ${String(files.length)}.`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}

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

  // ---- fiche 19: permission matrix ---------------------------------------

  it('serves the permission vocabulary and role grants for fiche 19 s permission matrix', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])

    const response = await fetch(`${server.base}/api/commerce/permissions`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      permissions: readonly string[]
      roles: Readonly<Record<string, readonly string[]>>
    }
    expect(body.permissions).toContain('commerce.order.refund')
    expect(body.roles.admin).toContain('commerce.order.refund')
    // `viewer` may look at the shop but never move money — the exact
    // distinction the permission matrix exists to make visible.
    expect(body.roles.viewer).toEqual(['commerce.read'])
  })

  it('refuses the permission vocabulary to a role that cannot even read the shop', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['subscriber'])

    const response = await fetch(`${server.base}/api/commerce/permissions`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(403)
  })

  // ---- fiche 34: store settings ------------------------------------------

  it('configures the four French VAT rates and the simulator confirms them, over a real server', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])
    const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    await fetch(`${server.base}/api/commerce/tax/rules`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Standard',
        country: 'FR',
        taxCategory: 'standard',
        rateBp: 2000,
      }),
    })
    await fetch(`${server.base}/api/commerce/tax/rules`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Super-reduced (books)',
        country: 'FR',
        taxCategory: 'super-reduced',
        rateBp: 550,
      }),
    })

    // "un livre est à 5,5 % et un ordinateur à 20 %" — the fiche's own
    // acceptance test for this task.
    const book = await fetch(`${server.base}/api/commerce/tax/simulate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ country: 'FR', taxCategory: 'super-reduced', amountMinor: 2000 }),
    })
    expect(book.status).toBe(200)
    expect(((await book.json()) as { outcome: { rateBp: number } }).outcome.rateBp).toBe(550)

    const computer = await fetch(`${server.base}/api/commerce/tax/simulate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ country: 'FR', taxCategory: 'standard', amountMinor: 100_000 }),
    })
    expect(computer.status).toBe(200)
    expect(((await computer.json()) as { outcome: { rateBp: number } }).outcome.rateBp).toBe(2000)
  })

  it('configures a shipping method and quotes it back through the simulator', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])
    const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const created = await fetch(`${server.base}/api/commerce/shipping/methods`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ label: 'Standard', currency: 'EUR', amountMinor: 490 }),
    })
    expect(created.status).toBe(201)

    const quote = await fetch(`${server.base}/api/commerce/shipping/simulate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ currency: 'EUR', subtotalMinor: 1000 }),
    })
    expect(quote.status).toBe(200)
    const quotes = ((await quote.json()) as { quotes: readonly { label: string }[] }).quotes
    expect(quotes).toEqual([expect.objectContaining({ label: 'Standard', amountMinor: 490 })])

    const list = await fetch(`${server.base}/api/commerce/shipping/methods`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const listBody = (await list.json()) as { methods: readonly { label: string }[] }
    expect(listBody.methods).toHaveLength(1)
  })

  it('lists the payment drivers with presence only, never a key', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])

    const response = await fetch(`${server.base}/api/commerce/payment/drivers`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      drivers: readonly { name: string; configured: boolean }[]
      testMode: boolean
      webhookUrl: string | null
    }
    expect(body.drivers.map((d) => d.name).sort()).toEqual(['manual', 'paypal', 'stripe'])
    expect(body.drivers.find((d) => d.name === 'manual')?.configured).toBe(true)
    // No Stripe key nor PayPal credentials were configured on this test site.
    expect(body.drivers.find((d) => d.name === 'stripe')?.configured).toBe(false)
    expect(body.drivers.find((d) => d.name === 'paypal')?.configured).toBe(false)
    // Test mode is on by default — "le mode test doit être criant".
    expect(body.testMode).toBe(true)
    expect(body.webhookUrl).toContain('/api/commerce/payments/webhook')
    expect(JSON.stringify(body)).not.toMatch(/sk_(live|test)_/u)
  })

  it('tests the bank-transfer connection, which always succeeds with no external service', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])

    const response = await fetch(
      `${server.base}/api/commerce/payment/drivers/manual/test-connection`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      },
    )
    expect(response.status).toBe(200)
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true)
  })

  it('refuses store-settings routes to a role with no commerce permission at all', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['subscriber'])

    const tax = await fetch(`${server.base}/api/commerce/tax/rules`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(tax.status).toBe(403)

    const shipping = await fetch(`${server.base}/api/commerce/shipping/methods`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(shipping.status).toBe(403)

    const payment = await fetch(`${server.base}/api/commerce/payment/drivers`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(payment.status).toBe(403)
  })

  it('reads and writes the general commerce settings and the invoice template through /api/settings, admin only', async () => {
    const root = await project()
    const server = await startServer(root)
    const admin = await signIn(root, server.base, ['admin'])
    const viewer = await signIn(root, server.base, ['viewer'])

    const list = await fetch(`${server.base}/api/settings`)
    expect(list.status).toBe(200)
    const listBody = (await list.json()) as {
      data: readonly { key: string; value: unknown; group: string }[]
    }
    const currency = listBody.data.find((setting) => setting.key === 'commerce.currency')
    expect(currency).toMatchObject({ value: 'EUR', group: 'commerce' })
    const tosPath = listBody.data.find((setting) => setting.key === 'commerce.tosPagePath')
    expect(tosPath).toMatchObject({ value: '' })

    const refused = await fetch(`${server.base}/api/settings`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${viewer}`, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'commerce.priceDisplay', value: 'ht' }),
    })
    expect(refused.status).toBe(403)

    const write = await fetch(`${server.base}/api/settings`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'commerce.priceDisplay', value: 'ht' }),
    })
    expect(write.status).toBe(200)

    const invoicePrefix = await fetch(`${server.base}/api/settings`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'commerce.invoiceSeriesPrefix', value: 'AC' }),
    })
    expect(invoicePrefix.status).toBe(200)

    const reread = await fetch(`${server.base}/api/settings`)
    const rereadBody = (await reread.json()) as { data: readonly { key: string; value: unknown }[] }
    expect(rereadBody.data.find((setting) => setting.key === 'commerce.priceDisplay')?.value).toBe(
      'ht',
    )
    expect(
      rereadBody.data.find((setting) => setting.key === 'commerce.invoiceSeriesPrefix')?.value,
    ).toBe('AC')
  })

  /**
   * Fiche 52's own acceptance criterion, verbatim: "commande → confirmation
   * e-mail → expédition → notification." Everything up to here in this file
   * proves the router; this is the one test that proves the whole thing runs
   * for real inside `cogenta serve` — a manual order placed through
   * `/api/commerce/orders`, a confirmation e-mail actually written by the
   * real `FileEmailTransport` `runServe` always builds (R1/R2 — no test seam
   * needed, every site gets one), tracking attached, and a second, distinct
   * e-mail for the shipment. `commerceEmailTickMs` is turned down to a few
   * milliseconds — the same seam `scheduledPublishTickMs` and its siblings
   * already establish — so the test does not wait sixty real seconds for the
   * retry queue's default cadence.
   */
  it('a real order → a real confirmation e-mail → shipped → a real shipment e-mail', async () => {
    const root = await project()
    const server = await startServer(root, { commerceEmailTickMs: 20 })
    const token = await signIn(root, server.base, ['admin'])
    const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const createProduct = await fetch(`${server.base}/api/commerce/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ handle: 'candle', title: 'Candle' }),
    })
    const product = (await createProduct.json()) as { id: string }
    const createVariant = await fetch(
      `${server.base}/api/commerce/products/${product.id}/variants`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          sku: 'CANDLE-1',
          title: 'Candle',
          priceMinor: 1200,
          currency: 'EUR',
          onHand: 10,
        }),
      },
    )
    const variant = (await createVariant.json()) as { id: string }

    // A shopkeeper-typed order (fiche 52 task 5) — no cart, no checkout.
    const placed = await fetch(`${server.base}/api/commerce/orders`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email: 'phone-order@example.com',
        currency: 'EUR',
        lines: [{ variantId: variant.id, quantity: 2 }],
        shippingAddress: { line1: '10 Downing Street', city: 'London', postalCode: 'SW1A 2AA' },
      }),
    })
    expect(placed.status).toBe(201)
    const placedBody = (await placed.json()) as { kind: string; order: { id: string } }
    expect(placedBody.kind).toBe('placed')
    const orderId = placedBody.order.id

    const mailDir = join(root, '.cogenta', 'mail')
    const confirmation = await waitForMail(mailDir, 1)
    expect(confirmation).toHaveLength(1)
    expect(confirmation[0]).toContain(`To: phone-order@example.com`)
    expect(confirmation[0]).toContain('Order confirmation')
    expect(confirmation[0]).toContain('Candle')

    // Pay it, then ship it with tracking — the second e-mail is fired by
    // `setTracking`'s own paid→shipped transition, through the real router.
    const settle = await fetch(`${server.base}/api/commerce/orders/${orderId}/status`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'paid' }),
    })
    expect(settle.status).toBe(200)

    const tracking = await fetch(`${server.base}/api/commerce/orders/${orderId}/tracking`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ carrier: 'Royal Mail', number: 'RM998877' }),
    })
    expect(tracking.status).toBe(200)
    expect((await tracking.json()) as { status: string }).toMatchObject({ status: 'shipped' })

    const both = await waitForMail(mailDir, 2)
    expect(both).toHaveLength(2)
    const shipment = both.find((message) => message.includes('has shipped'))
    expect(shipment).toBeDefined()
    expect(shipment).toContain('Royal Mail')
    expect(shipment).toContain('RM998877')

    // The e-mail log the admin screen reads is the same journal.
    const emails = await fetch(`${server.base}/api/commerce/orders/${orderId}/emails`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const emailsBody = (await emails.json()) as { emails: readonly { status: string }[] }
    expect(emailsBody.emails).toHaveLength(2)
    expect(emailsBody.emails.every((e) => e.status === 'sent')).toBe(true)

    // And the order's own history names both e-mails — "journal visible sur
    // la commande".
    const detail = await fetch(`${server.base}/api/commerce/orders/${orderId}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const detailBody = (await detail.json()) as { history: readonly { note: string | null }[] }
    expect(detailBody.history.some((event) => event.note?.includes('Confirmation') ?? false)).toBe(
      true,
    )
    expect(
      detailBody.history.some((event) => event.note?.includes('Shipment notification') ?? false),
    ).toBe(true)
  })
})
