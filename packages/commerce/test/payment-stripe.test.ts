import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { type AddressInfo, createServer as createSocketServer } from 'node:net'
import { CogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stripePaymentDriver } from '../src/payment/stripe.js'
import type { PaymentConfig, PaymentGateway } from '../src/payment/types.js'

/**
 * Every test here talks to a real `node:http` server on an ephemeral port,
 * reached through the driver's real `fetch`. Nothing about the driver is
 * mocked: the body asserted below is the body that crossed a socket, parsed
 * back from the wire as `application/x-www-form-urlencoded`.
 *
 * "Pas de mock de la base" (AGENTS.md) is a rule about the database, but the
 * reasoning is the same for a gateway: a hand-written double agrees with
 * whatever the driver does, including its mistakes.
 */

const SECRET_KEY = 'sk_test_51SuperSecretValueThatMustNeverLeak'
const WEBHOOK_SECRET = 'whsec_TheSigningSecretForThisEndpoint'

interface RecordedRequest {
  readonly method: string
  readonly path: string
  readonly authorization: string | undefined
  readonly contentType: string | undefined
  readonly body: string
}

interface StubReply {
  readonly status: number
  readonly json: unknown
}

interface StripeStub {
  readonly baseUrl: string
  readonly requests: readonly RecordedRequest[]
  /** Answers the next request hitting `method path`, once per queued reply. */
  reply(route: string, reply: StubReply): void
  close(): Promise<void>
}

async function startStripeStub(): Promise<StripeStub> {
  const requests: RecordedRequest[] = []
  const replies = new Map<string, StubReply[]>()

  const handler = (request: IncomingMessage, response: ServerResponse): void => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const path = (request.url ?? '').split('?')[0] ?? ''
      const route = `${request.method ?? 'GET'} ${path}`
      requests.push({
        method: request.method ?? 'GET',
        path,
        authorization: request.headers.authorization,
        contentType: request.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      })

      const queued = replies.get(route)?.shift()
      const reply: StubReply = queued ?? {
        status: 404,
        json: { error: { type: 'invalid_request_error', message: `no stub for ${route}` } },
      }
      response.writeHead(reply.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(reply.json))
    })
  }

  const server: Server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    reply: (route, reply) => {
      const queue = replies.get(route) ?? []
      queue.push(reply)
      replies.set(route, queue)
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)))
      }),
  }
}

/** A port nothing is listening on, so `fetch` really is refused at the TCP level. */
async function findClosedPort(): Promise<number> {
  const server = createSocketServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

/**
 * The signature is computed here, from Stripe's documented scheme, with no
 * help from the implementation. A test that imported the signing helper would
 * only prove the driver agrees with itself.
 */
function signStripePayload(payload: string, secret: string, timestampSeconds: number): string {
  const digest = createHmac('sha256', secret).update(`${timestampSeconds}.${payload}`).digest('hex')
  return `t=${timestampSeconds},v1=${digest}`
}

function paymentIntentEvent(type: string, id: string, amount: number): string {
  return JSON.stringify({
    id: 'evt_1',
    type,
    data: {
      object: {
        id,
        object: 'payment_intent',
        amount,
        currency: 'eur',
        metadata: { order_reference: 'CG-2026-0007' },
      },
    },
  })
}

function parseForm(body: string): URLSearchParams {
  return new URLSearchParams(body)
}

describe('the Stripe payment driver against a real HTTP server', () => {
  let stub: StripeStub
  let config: PaymentConfig
  let gateway: PaymentGateway

  beforeEach(async () => {
    stub = await startStripeStub()
    config = {
      secretKey: SECRET_KEY,
      webhookSecret: WEBHOOK_SECRET,
      apiBaseUrl: stub.baseUrl,
    }
    gateway = await stripePaymentDriver().init(config)
  })

  afterEach(async () => {
    await stub.close()
  })

  it('creates a payment intent with a form-encoded body Stripe would accept', async () => {
    stub.reply('POST /v1/payment_intents', {
      status: 200,
      json: {
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'pi_123_secret_abc',
      },
    })

    const started = await gateway.start({
      orderId: 'order-internal-1',
      orderReference: 'CG-2026-0007',
      amountMinor: 1999,
      currency: 'EUR',
      customerEmail: 'buyer@example.com',
      description: 'Order CG-2026-0007',
    })

    const sent = stub.requests.at(0)
    expect(sent?.method).toBe('POST')
    expect(sent?.path).toBe('/v1/payment_intents')
    expect(sent?.contentType).toBe('application/x-www-form-urlencoded')
    expect(sent?.authorization).toBe(`Bearer ${SECRET_KEY}`)

    // The literal wire bytes, in the order the driver wrote them.
    expect(sent?.body).toContain('amount=1999&currency=eur')

    const form = parseForm(sent?.body ?? '')
    expect(form.get('metadata[order_reference]')).toBe('CG-2026-0007')
    expect(form.get('receipt_email')).toBe('buyer@example.com')
    expect(form.get('automatic_payment_methods[enabled]')).toBe('true')
    expect(form.get('description')).toBe('Order CG-2026-0007')

    expect(started).toEqual({
      externalId: 'pi_123',
      status: 'pending',
      instructions: 'pi_123_secret_abc',
    })
  })

  it('lower-cases the currency because Stripe refuses an upper-case code', async () => {
    stub.reply('POST /v1/payment_intents', {
      status: 200,
      json: { id: 'pi_currency', status: 'processing', client_secret: null },
    })

    await gateway.start({
      orderId: 'order-2',
      orderReference: 'CG-2026-0008',
      amountMinor: 500,
      currency: 'USD',
      customerEmail: 'buyer@example.com',
    })

    expect(parseForm(stub.requests.at(0)?.body ?? '').get('currency')).toBe('usd')
  })

  it.each([
    ['requires_payment_method', 'pending'],
    ['requires_confirmation', 'pending'],
    ['requires_action', 'pending'],
    ['processing', 'pending'],
    ['requires_capture', 'authorised'],
    ['succeeded', 'paid'],
    ['canceled', 'cancelled'],
  ])('reads a Stripe intent in state "%s" as "%s"', async (stripeStatus, expected) => {
    stub.reply('GET /v1/payment_intents/pi_read', {
      status: 200,
      json: { id: 'pi_read', status: stripeStatus, client_secret: 'cs_1' },
    })

    const fetched = await gateway.fetch('pi_read')
    expect(fetched.status).toBe(expected)
  })

  it('treats an intent state it has never heard of as failed rather than guessing paid', async () => {
    stub.reply('GET /v1/payment_intents/pi_new', {
      status: 200,
      json: { id: 'pi_new', status: 'requires_teleportation', client_secret: null },
    })

    expect((await gateway.fetch('pi_new')).status).toBe('failed')
  })

  it('refunds against the payment intent, not the charge', async () => {
    stub.reply('POST /v1/refunds', {
      status: 200,
      json: { id: 're_1', status: 'succeeded' },
    })

    const result = await gateway.refund({
      externalId: 'pi_123',
      amountMinor: 500,
      currency: 'EUR',
      reason: 'shopper changed their mind',
    })

    const sent = stub.requests.at(0)
    expect(sent?.path).toBe('/v1/refunds')
    const form = parseForm(sent?.body ?? '')
    expect(form.get('payment_intent')).toBe('pi_123')
    expect(form.get('amount')).toBe('500')

    expect(result).toEqual({ externalId: 're_1', status: 'refunded' })
  })

  it('reports a refund Stripe has not settled yet as pending, not as refunded', async () => {
    stub.reply('POST /v1/refunds', { status: 200, json: { id: 're_2', status: 'pending' } })

    expect(
      await gateway.refund({ externalId: 'pi_123', amountMinor: 100, currency: 'EUR' }),
    ).toEqual({ externalId: 're_2', status: 'pending' })
  })

  it('turns an HTTP 402 into a typed error that leaks no part of the secret key', async () => {
    stub.reply('POST /v1/payment_intents', {
      status: 402,
      json: {
        error: {
          type: 'card_error',
          code: 'card_declined',
          message: 'Your card was declined.',
        },
      },
    })

    const thrown = await gateway
      .start({
        orderId: 'order-3',
        orderReference: 'CG-2026-0009',
        amountMinor: 1000,
        currency: 'EUR',
        customerEmail: 'buyer@example.com',
      })
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(thrown).toBeInstanceOf(CogentaError)
    const error = thrown as CogentaError
    expect(error.code).toBe('COMMERCE_PAYMENT_FAILED')
    expect(error.message).toContain('402')
    expect(error.message).toContain('Your card was declined.')
    expect(error.details).toMatchObject({ status: 402, stripeErrorCode: 'card_declined' })

    const serialised = `${error.message} ${error.hint ?? ''} ${JSON.stringify(error.details)}`
    expect(serialised).not.toContain(SECRET_KEY)
    expect(serialised).not.toContain('sk_test')
    expect(serialised).not.toContain('SuperSecret')
    expect(serialised).not.toContain(WEBHOOK_SECRET)
  })
})

describe('Stripe webhook signature verification', () => {
  let stub: StripeStub
  let gateway: PaymentGateway

  beforeEach(async () => {
    stub = await startStripeStub()
    gateway = await stripePaymentDriver().init({
      secretKey: SECRET_KEY,
      webhookSecret: WEBHOOK_SECRET,
      apiBaseUrl: stub.baseUrl,
    })
  })

  afterEach(async () => {
    await stub.close()
  })

  const nowSeconds = (): number => Math.floor(Date.now() / 1000)

  it('accepts a genuinely signed payload and decodes it into a payment event', async () => {
    const payload = paymentIntentEvent('payment_intent.succeeded', 'pi_ok', 1999)
    const header = signStripePayload(payload, WEBHOOK_SECRET, nowSeconds())

    expect(await gateway.verifyEvent(payload, { 'stripe-signature': header })).toEqual({
      externalId: 'pi_ok',
      orderReference: 'CG-2026-0007',
      status: 'paid',
      amountMinor: 1999,
      currency: 'EUR',
    })
  })

  it('finds the header whatever case the HTTP server spelled it in', async () => {
    const payload = paymentIntentEvent('payment_intent.payment_failed', 'pi_ko', 800)
    const header = signStripePayload(payload, WEBHOOK_SECRET, nowSeconds())

    const event = await gateway.verifyEvent(payload, { 'Stripe-Signature': header })
    expect(event.status).toBe('failed')
  })

  it('accepts a delivery whose matching signature is not the first v1, as during a secret rotation', async () => {
    const payload = paymentIntentEvent('payment_intent.canceled', 'pi_rot', 300)
    const timestamp = nowSeconds()
    const stale = createHmac('sha256', 'whsec_TheOldSecretBeingRotatedOut')
      .update(`${timestamp}.${payload}`)
      .digest('hex')
    const live = createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.${payload}`)
      .digest('hex')

    const event = await gateway.verifyEvent(payload, {
      'stripe-signature': `t=${timestamp},v1=${stale},v1=${live}`,
    })
    expect(event.status).toBe('cancelled')
  })

  it('reads a charge refund as a refund of its payment intent', async () => {
    const payload = JSON.stringify({
      id: 'evt_refund',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_1',
          object: 'charge',
          payment_intent: 'pi_refunded',
          amount: 1999,
          amount_refunded: 500,
          currency: 'eur',
          metadata: { order_reference: 'CG-2026-0007' },
        },
      },
    })

    expect(
      await gateway.verifyEvent(payload, {
        'stripe-signature': signStripePayload(payload, WEBHOOK_SECRET, nowSeconds()),
      }),
    ).toEqual({
      externalId: 'pi_refunded',
      orderReference: 'CG-2026-0007',
      status: 'refunded',
      amountMinor: 500,
      currency: 'EUR',
    })
  })

  async function expectRefusal(
    payload: string,
    headers: Readonly<Record<string, string>>,
  ): Promise<CogentaError> {
    const thrown = await gateway.verifyEvent(payload, headers).then(
      () => null,
      (error: unknown) => error,
    )
    expect(thrown).toBeInstanceOf(CogentaError)
    const error = thrown as CogentaError
    expect(error.code).toBe('COMMERCE_PAYMENT_SIGNATURE_INVALID')
    return error
  }

  it('refuses a payload tampered with after it was signed', async () => {
    const payload = paymentIntentEvent('payment_intent.succeeded', 'pi_ok', 1999)
    const header = signStripePayload(payload, WEBHOOK_SECRET, nowSeconds())

    await expectRefusal(payload.replace('1999', '199900'), { 'stripe-signature': header })
  })

  it('refuses a payload signed with a secret this site does not hold', async () => {
    const payload = paymentIntentEvent('payment_intent.succeeded', 'pi_ok', 1999)

    await expectRefusal(payload, {
      'stripe-signature': signStripePayload(payload, 'whsec_AnAttackersOwnSecret', nowSeconds()),
    })
  })

  it('refuses a signature that is genuine but was cut from a different delivery', async () => {
    const other = paymentIntentEvent('payment_intent.succeeded', 'pi_other', 5000)
    const header = signStripePayload(other, WEBHOOK_SECRET, nowSeconds())
    const target = paymentIntentEvent('payment_intent.succeeded', 'pi_target', 1)

    await expectRefusal(target, { 'stripe-signature': header })
  })

  it('refuses a delivery that carries no signature header at all', async () => {
    const payload = paymentIntentEvent('payment_intent.succeeded', 'pi_ok', 1999)

    await expectRefusal(payload, {})
    await expectRefusal(payload, { 'stripe-signature': '' })
  })

  it('refuses a ten-minute-old delivery, because a valid signature stays valid forever', async () => {
    const payload = paymentIntentEvent('payment_intent.succeeded', 'pi_ok', 1999)
    const header = signStripePayload(payload, WEBHOOK_SECRET, nowSeconds() - 600)

    const error = await expectRefusal(payload, { 'stripe-signature': header })
    expect(error.message).toContain('outside')
  })

  it('refuses a header with no timestamp and one with no v1 value', async () => {
    const payload = paymentIntentEvent('payment_intent.succeeded', 'pi_ok', 1999)

    await expectRefusal(payload, { 'stripe-signature': 'v1=deadbeef' })
    await expectRefusal(payload, { 'stripe-signature': `t=${nowSeconds()}` })
  })

  it('refuses to verify anything when the site has configured no webhook secret', async () => {
    const unconfigured = await stripePaymentDriver().init({
      secretKey: SECRET_KEY,
      apiBaseUrl: stub.baseUrl,
    })
    const payload = paymentIntentEvent('payment_intent.succeeded', 'pi_ok', 1999)

    const thrown = await unconfigured
      .verifyEvent(payload, {
        'stripe-signature': signStripePayload(payload, WEBHOOK_SECRET, nowSeconds()),
      })
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect((thrown as CogentaError).code).toBe('COMMERCE_PAYMENT_SIGNATURE_INVALID')
  })

  it('refuses an authentic event whose type it has no reading for', async () => {
    const payload = JSON.stringify({
      id: 'evt_x',
      type: 'invoice.payment_action_required',
      data: { object: { id: 'in_1' } },
    })

    const thrown = await gateway
      .verifyEvent(payload, {
        'stripe-signature': signStripePayload(payload, WEBHOOK_SECRET, nowSeconds()),
      })
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect((thrown as CogentaError).code).toBe('COMMERCE_PAYMENT_UNSUPPORTED')
  })
})

describe('Stripe driver availability', () => {
  it('answers false, never throws, when no secret key is configured', async () => {
    await expect(stripePaymentDriver().available({})).resolves.toBe(false)
    await expect(stripePaymentDriver().available({ secretKey: '' })).resolves.toBe(false)
  })

  it('answers false, never throws, when nothing is listening on the configured address', async () => {
    const port = await findClosedPort()

    await expect(
      stripePaymentDriver().available({
        secretKey: SECRET_KEY,
        apiBaseUrl: `http://127.0.0.1:${port}`,
      }),
    ).resolves.toBe(false)
  })

  it('answers false when the key is refused, and true when the balance call succeeds', async () => {
    const stub = await startStripeStub()
    try {
      stub.reply('GET /v1/balance', {
        status: 401,
        json: { error: { type: 'invalid_request_error', message: 'Invalid API Key provided' } },
      })
      await expect(
        stripePaymentDriver().available({ secretKey: SECRET_KEY, apiBaseUrl: stub.baseUrl }),
      ).resolves.toBe(false)

      stub.reply('GET /v1/balance', { status: 200, json: { object: 'balance' } })
      await expect(
        stripePaymentDriver().available({ secretKey: SECRET_KEY, apiBaseUrl: stub.baseUrl }),
      ).resolves.toBe(true)

      expect(stub.requests.at(0)?.authorization).toBe(`Bearer ${SECRET_KEY}`)
    } finally {
      await stub.close()
    }
  })

  it('reports its health without ever naming the key', async () => {
    const stub = await startStripeStub()
    const driver = stripePaymentDriver()
    try {
      expect((await driver.health()).status).toBe('down')

      await driver.init({ secretKey: SECRET_KEY, apiBaseUrl: stub.baseUrl })
      stub.reply('GET /v1/balance', { status: 200, json: { object: 'balance' } })

      const report = await driver.health()
      expect(report.status).toBe('ok')
      expect(report.driver).toBe('stripe')
      expect(report.tier).toBe('optimal')
      expect(`${report.message ?? ''}${JSON.stringify(report.details ?? {})}`).not.toContain(
        'sk_test',
      )
    } finally {
      await driver.dispose()
      await stub.close()
    }
  })

  it('refuses to initialise without a secret key rather than failing at the first charge', async () => {
    const thrown = await stripePaymentDriver()
      .init({})
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(thrown).toBeInstanceOf(CogentaError)
    expect((thrown as CogentaError).code).toBe('CONFIG_INVALID')
  })
})
