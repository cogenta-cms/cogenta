import { createSign, generateKeyPairSync } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { type AddressInfo, createServer as createSocketServer } from 'node:net'
import { crc32 } from 'node:zlib'
import { CogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { paypalPaymentDriver } from '../src/payment/paypal.js'
import type { PaymentConfig, PaymentGateway } from '../src/payment/types.js'

/**
 * The same discipline as `test/payment-stripe.test.ts`: every test here talks
 * to a real `node:http` server on an ephemeral port, reached through the
 * driver's real `fetch`. Nothing is mocked — the body asserted below is the
 * body that crossed a socket, and the webhook signature is verified with
 * `node:crypto` against a key this file generates itself, not a helper
 * imported from the driver.
 *
 * A PayPal certificate's public key is served for `paypal-cert-url`
 * verification without shelling out to `openssl` for a real X.509
 * certificate: `crypto.verify` accepts a bare SPKI public-key PEM exactly as
 * it accepts a certificate PEM (Node extracts the public key from either),
 * so a generated key pair is enough to prove the RSA-SHA256 check for real.
 */

const CLIENT_ID = 'test-client-id-not-a-real-paypal-app'
const CLIENT_SECRET = 'test-client-secret-must-never-leak'
const WEBHOOK_ID = '8PT597110X687430LKGECATA'

interface RecordedRequest {
  readonly method: string
  readonly path: string
  readonly authorization: string | undefined
  readonly contentType: string | undefined
  readonly body: string
}

interface StubReply {
  readonly status: number
  readonly json?: unknown
  readonly text?: string
}

interface PayPalStub {
  readonly baseUrl: string
  readonly requests: readonly RecordedRequest[]
  reply(route: string, reply: StubReply): void
  close(): Promise<void>
}

async function startPayPalStub(): Promise<PayPalStub> {
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
        json: { name: 'NOT_FOUND', message: `no stub for ${route}` },
      }
      if (reply.text !== undefined) {
        response.writeHead(reply.status, { 'content-type': 'text/plain' })
        response.end(reply.text)
        return
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

function queueToken(stub: PayPalStub, token = 'A21AAaccesstoken', expiresIn = 3_600): void {
  stub.reply('POST /v1/oauth2/token', {
    status: 200,
    json: { access_token: token, token_type: 'Bearer', expires_in: expiresIn },
  })
}

interface WebhookSigner {
  readonly certPem: string
  sign(payload: string, transmissionId: string, timestamp: string, webhookId: string): string
}

/** A real RSA key pair, generated fresh per test file run — never imported from the driver. */
function createWebhookSigner(): WebhookSigner {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    certPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    sign: (payload, transmissionId, timestamp, webhookId) => {
      // PayPal's own documented scheme, computed independently of the driver.
      const crc = (crc32(payload) >>> 0).toString(10)
      const message = `${transmissionId}|${timestamp}|${webhookId}|${crc}`
      return createSign('RSA-SHA256').update(message).sign(privateKey, 'base64')
    },
  }
}

function captureCompletedEvent(orderId: string, captureId: string, amount: string): string {
  return JSON.stringify({
    id: 'WH-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: captureId,
      status: 'COMPLETED',
      amount: { currency_code: 'EUR', value: amount },
      supplementary_data: { related_ids: { order_id: orderId } },
    },
  })
}

function parseJson(body: string): Readonly<Record<string, unknown>> {
  return JSON.parse(body) as Readonly<Record<string, unknown>>
}

describe('the PayPal payment driver against a real HTTP server', () => {
  let stub: PayPalStub
  let config: PaymentConfig
  let gateway: PaymentGateway

  beforeEach(async () => {
    stub = await startPayPalStub()
    config = { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, apiBaseUrl: stub.baseUrl }
    gateway = await paypalPaymentDriver().init(config)
  })

  afterEach(async () => {
    await stub.close()
  })

  it('creates an order with a decimal amount in major units, authenticated by a fresh OAuth2 token', async () => {
    queueToken(stub)
    stub.reply('POST /v2/checkout/orders', {
      status: 201,
      json: {
        id: 'order-1',
        status: 'CREATED',
        links: [{ rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=order-1' }],
      },
    })

    const started = await gateway.start({
      orderId: 'internal-1',
      orderReference: 'CG-2026-0007',
      amountMinor: 1999,
      currency: 'EUR',
      customerEmail: 'buyer@example.com',
      returnUrl: 'https://shop.example.com/checkout/return',
      description: 'Order CG-2026-0007',
    })

    const tokenRequest = stub.requests.find((r) => r.path === '/v1/oauth2/token')
    expect(tokenRequest?.authorization).toBe(
      `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`, 'utf8').toString('base64')}`,
    )

    const orderRequest = stub.requests.find((r) => r.path === '/v2/checkout/orders')
    expect(orderRequest?.method).toBe('POST')
    expect(orderRequest?.contentType).toBe('application/json')
    expect(orderRequest?.authorization).toBe('Bearer A21AAaccesstoken')

    const body = parseJson(orderRequest?.body ?? '{}')
    expect(body.intent).toBe('CAPTURE')
    const unit = (body.purchase_units as readonly Record<string, unknown>[])[0]
    expect(unit?.reference_id).toBe('CG-2026-0007')
    // Minor units (1999) become a decimal major-unit string ("19.99") —
    // PayPal's amount format, unlike every other integer in this project.
    expect((unit?.amount as Record<string, unknown>)?.value).toBe('19.99')
    expect((unit?.amount as Record<string, unknown>)?.currency_code).toBe('EUR')
    const context = body.application_context as Record<string, unknown>
    expect(context?.return_url).toBe('https://shop.example.com/checkout/return')

    expect(started).toEqual({
      externalId: 'order-1',
      status: 'pending',
      instructions: 'https://www.paypal.com/checkoutnow?token=order-1',
    })
  })

  it('caches the OAuth2 token across calls instead of asking for a new one every time', async () => {
    queueToken(stub, 'tok-once', 3_600)
    stub.reply('GET /v2/checkout/orders/order-cached', {
      status: 200,
      json: { id: 'order-cached', status: 'CREATED' },
    })
    stub.reply('GET /v2/checkout/orders/order-cached', {
      status: 200,
      json: { id: 'order-cached', status: 'SAVED' },
    })

    await gateway.fetch('order-cached')
    await gateway.fetch('order-cached')

    expect(stub.requests.filter((r) => r.path === '/v1/oauth2/token')).toHaveLength(1)
  })

  it.each([
    ['CREATED', 'pending'],
    ['SAVED', 'pending'],
    ['PAYER_ACTION_REQUIRED', 'pending'],
    ['VOIDED', 'cancelled'],
    ['COMPLETED', 'paid'],
  ])('reads a PayPal order in state "%s" as "%s"', async (paypalStatus, expected) => {
    queueToken(stub)
    stub.reply('GET /v2/checkout/orders/order-read', {
      status: 200,
      json: { id: 'order-read', status: paypalStatus },
    })

    expect((await gateway.fetch('order-read')).status).toBe(expected)
  })

  it('treats an order status it has never heard of as failed rather than guessing paid', async () => {
    queueToken(stub)
    stub.reply('GET /v2/checkout/orders/order-new', {
      status: 200,
      json: { id: 'order-new', status: 'SOMETHING_FUTURE_VERSIONS_ADD' },
    })

    expect((await gateway.fetch('order-new')).status).toBe('failed')
  })

  it('captures an approved order automatically when polled, and reports the status the capture produced', async () => {
    queueToken(stub)
    stub.reply('GET /v2/checkout/orders/order-approved', {
      status: 200,
      json: { id: 'order-approved', status: 'APPROVED' },
    })
    stub.reply('POST /v2/checkout/orders/order-approved/capture', {
      status: 201,
      json: { id: 'order-approved', status: 'COMPLETED' },
    })

    const fetched = await gateway.fetch('order-approved')

    expect(fetched.status).toBe('paid')
    const paths = stub.requests.map((r) => `${r.method} ${r.path}`)
    expect(paths).toContain('GET /v2/checkout/orders/order-approved')
    expect(paths).toContain('POST /v2/checkout/orders/order-approved/capture')
  })

  it('re-reads the order instead of failing when a concurrent poll already captured it', async () => {
    queueToken(stub)
    stub.reply('GET /v2/checkout/orders/order-race', {
      status: 200,
      json: { id: 'order-race', status: 'APPROVED' },
    })
    stub.reply('POST /v2/checkout/orders/order-race/capture', {
      status: 422,
      json: {
        name: 'UNPROCESSABLE_ENTITY',
        message: 'The order has already been captured.',
        details: [{ issue: 'ORDER_ALREADY_CAPTURED' }],
      },
    })
    stub.reply('GET /v2/checkout/orders/order-race', {
      status: 200,
      json: { id: 'order-race', status: 'COMPLETED' },
    })

    const fetched = await gateway.fetch('order-race')
    expect(fetched.status).toBe('paid')
  })

  it('does not swallow a capture failure that is not the known race', async () => {
    queueToken(stub)
    stub.reply('GET /v2/checkout/orders/order-declined', {
      status: 200,
      json: { id: 'order-declined', status: 'APPROVED' },
    })
    stub.reply('POST /v2/checkout/orders/order-declined/capture', {
      status: 422,
      json: {
        name: 'UNPROCESSABLE_ENTITY',
        message: 'Instrument declined.',
        details: [{ issue: 'INSTRUMENT_DECLINED' }],
      },
    })

    const thrown = await gateway.fetch('order-declined').then(
      () => null,
      (error: unknown) => error,
    )
    expect(thrown).toBeInstanceOf(CogentaError)
    expect((thrown as CogentaError).code).toBe('COMMERCE_PAYMENT_FAILED')
  })

  it('refunds against the capture id found under the order, not the order id', async () => {
    queueToken(stub)
    stub.reply('GET /v2/checkout/orders/order-paid', {
      status: 200,
      json: {
        id: 'order-paid',
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'CAP-1' }] } }],
      },
    })
    stub.reply('POST /v2/payments/captures/CAP-1/refund', {
      status: 201,
      json: { id: 'REFUND-1', status: 'COMPLETED' },
    })

    const result = await gateway.refund({
      externalId: 'order-paid',
      amountMinor: 500,
      currency: 'EUR',
      reason: 'shopper changed their mind',
    })

    const refundRequest = stub.requests.find((r) => r.path === '/v2/payments/captures/CAP-1/refund')
    const body = parseJson(refundRequest?.body ?? '{}')
    expect((body.amount as Record<string, unknown>)?.value).toBe('5.00')
    expect(body.note_to_payer).toBe('shopper changed their mind')

    expect(result).toEqual({ externalId: 'REFUND-1', status: 'refunded' })
  })

  it('refuses to refund an order that has not been captured yet', async () => {
    queueToken(stub)
    stub.reply('GET /v2/checkout/orders/order-uncaptured', {
      status: 200,
      json: { id: 'order-uncaptured', status: 'APPROVED', purchase_units: [{}] },
    })

    const thrown = await gateway
      .refund({ externalId: 'order-uncaptured', amountMinor: 100, currency: 'EUR' })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(thrown).toBeInstanceOf(CogentaError)
    expect((thrown as CogentaError).code).toBe('COMMERCE_PAYMENT_FAILED')
  })

  it('reports a refund PayPal has not settled yet as pending, not as refunded', async () => {
    queueToken(stub)
    stub.reply('GET /v2/checkout/orders/order-pending-refund', {
      status: 200,
      json: {
        id: 'order-pending-refund',
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'CAP-2' }] } }],
      },
    })
    stub.reply('POST /v2/payments/captures/CAP-2/refund', {
      status: 202,
      json: { id: 'REFUND-2', status: 'PENDING' },
    })

    expect(
      await gateway.refund({
        externalId: 'order-pending-refund',
        amountMinor: 100,
        currency: 'EUR',
      }),
    ).toEqual({ externalId: 'REFUND-2', status: 'pending' })
  })

  it('turns an HTTP error into a typed error that leaks no part of the credentials', async () => {
    queueToken(stub)
    stub.reply('POST /v2/checkout/orders', {
      status: 422,
      json: {
        name: 'UNPROCESSABLE_ENTITY',
        message: 'The requested currency is not supported.',
        details: [{ issue: 'CURRENCY_NOT_SUPPORTED' }],
      },
    })

    const thrown = await gateway
      .start({
        orderId: 'order-x',
        orderReference: 'CG-2026-0010',
        amountMinor: 1000,
        currency: 'XYZ',
        customerEmail: 'buyer@example.com',
      })
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(thrown).toBeInstanceOf(CogentaError)
    const error = thrown as CogentaError
    expect(error.code).toBe('COMMERCE_PAYMENT_FAILED')
    expect(error.message).toContain('422')
    expect(error.details).toMatchObject({ status: 422, paypalIssue: 'CURRENCY_NOT_SUPPORTED' })

    const serialised = `${error.message} ${error.hint ?? ''} ${JSON.stringify(error.details)}`
    expect(serialised).not.toContain(CLIENT_SECRET)
  })
})

describe('PayPal webhook signature verification', () => {
  let stub: PayPalStub
  let signer: WebhookSigner
  let gateway: PaymentGateway
  let currentTimeMs: number

  beforeEach(async () => {
    stub = await startPayPalStub()
    signer = createWebhookSigner()
    currentTimeMs = Date.parse('2026-08-27T12:00:00.000Z')
    gateway = await paypalPaymentDriver({ now: () => currentTimeMs }).init({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      webhookId: WEBHOOK_ID,
      apiBaseUrl: stub.baseUrl,
    })
  })

  afterEach(async () => {
    await stub.close()
  })

  function certUrl(): string {
    return `${stub.baseUrl}/cert`
  }

  function serveCert(): void {
    stub.reply('GET /cert', { status: 200, text: signer.certPem })
  }

  function headersFor(
    payload: string,
    timestamp: string,
    transmissionId = 'txn-1',
  ): Record<string, string> {
    return {
      'paypal-transmission-id': transmissionId,
      'paypal-transmission-time': timestamp,
      'paypal-cert-url': certUrl(),
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': signer.sign(payload, transmissionId, timestamp, WEBHOOK_ID),
    }
  }

  it('accepts a genuinely signed capture event and decodes it into a payment event', async () => {
    serveCert()
    const payload = captureCompletedEvent('order-webhook-1', 'CAP-9', '19.99')
    const timestamp = new Date(currentTimeMs).toISOString()

    expect(await gateway.verifyEvent(payload, headersFor(payload, timestamp))).toEqual({
      externalId: 'order-webhook-1',
      orderReference: null,
      status: 'paid',
      amountMinor: 1999,
      currency: 'EUR',
    })
  })

  it('finds the headers whatever case the HTTP server spelled them in', async () => {
    serveCert()
    const payload = captureCompletedEvent('order-webhook-2', 'CAP-10', '5.00')
    const timestamp = new Date(currentTimeMs).toISOString()
    const headers = headersFor(payload, timestamp)

    const event = await gateway.verifyEvent(payload, {
      'Paypal-Transmission-Id': headers['paypal-transmission-id'] ?? '',
      'PAYPAL-TRANSMISSION-TIME': headers['paypal-transmission-time'] ?? '',
      'Paypal-Cert-Url': headers['paypal-cert-url'] ?? '',
      'Paypal-Auth-Algo': headers['paypal-auth-algo'] ?? '',
      'Paypal-Transmission-Sig': headers['paypal-transmission-sig'] ?? '',
    })
    expect(event.status).toBe('paid')
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
    serveCert()
    const payload = captureCompletedEvent('order-webhook-3', 'CAP-11', '19.99')
    const timestamp = new Date(currentTimeMs).toISOString()
    const headers = headersFor(payload, timestamp)

    await expectRefusal(payload.replace('19.99', '999.99'), headers)
  })

  it('refuses a signature made by a key this site does not hold', async () => {
    serveCert()
    const payload = captureCompletedEvent('order-webhook-4', 'CAP-12', '19.99')
    const timestamp = new Date(currentTimeMs).toISOString()
    const impostor = createWebhookSigner()

    await expectRefusal(payload, {
      'paypal-transmission-id': 'txn-impostor',
      'paypal-transmission-time': timestamp,
      'paypal-cert-url': certUrl(),
      'paypal-auth-algo': 'SHA256withRSA',
      // Signed with a different key, but claiming this site's cert.
      'paypal-transmission-sig': impostor.sign(payload, 'txn-impostor', timestamp, WEBHOOK_ID),
    })
  })

  it('refuses a certificate url that is not a trusted PayPal host — the anti-spoofing check', async () => {
    const payload = captureCompletedEvent('order-webhook-5', 'CAP-13', '19.99')
    const timestamp = new Date(currentTimeMs).toISOString()
    const transmissionId = 'txn-spoof'

    const error = await expectRefusal(payload, {
      'paypal-transmission-id': transmissionId,
      'paypal-transmission-time': timestamp,
      'paypal-cert-url': 'https://attacker.example.com/fake-cert.pem',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': signer.sign(payload, transmissionId, timestamp, WEBHOOK_ID),
    })
    expect(error.message).toContain('trusted')
  })

  it('refuses a ten-minute-old delivery, because a valid signature stays valid forever', async () => {
    serveCert()
    const payload = captureCompletedEvent('order-webhook-6', 'CAP-14', '19.99')
    const staleTimestamp = new Date(currentTimeMs - 10 * 60 * 1000).toISOString()

    const error = await expectRefusal(payload, headersFor(payload, staleTimestamp))
    expect(error.message).toContain('outside')
  })

  it('refuses a delivery missing any of the required headers', async () => {
    serveCert()
    const payload = captureCompletedEvent('order-webhook-7', 'CAP-15', '19.99')
    const timestamp = new Date(currentTimeMs).toISOString()
    const full = headersFor(payload, timestamp)

    for (const missing of [
      'paypal-transmission-id',
      'paypal-transmission-time',
      'paypal-cert-url',
      'paypal-transmission-sig',
    ]) {
      const partial = { ...full }
      delete partial[missing]
      await expectRefusal(payload, partial)
    }
  })

  it('refuses to verify anything when the site has configured no webhook id', async () => {
    serveCert()
    const unconfigured = await paypalPaymentDriver({ now: () => currentTimeMs }).init({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      apiBaseUrl: stub.baseUrl,
    })
    const payload = captureCompletedEvent('order-webhook-8', 'CAP-16', '19.99')
    const timestamp = new Date(currentTimeMs).toISOString()

    const thrown = await unconfigured.verifyEvent(payload, headersFor(payload, timestamp)).then(
      () => null,
      (error: unknown) => error,
    )
    expect((thrown as CogentaError).code).toBe('COMMERCE_PAYMENT_SIGNATURE_INVALID')
  })

  it('refuses an authentic event whose type it has no reading for', async () => {
    serveCert()
    const payload = JSON.stringify({
      id: 'WH-2',
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: 'order-webhook-9' },
    })
    const timestamp = new Date(currentTimeMs).toISOString()

    const thrown = await gateway.verifyEvent(payload, headersFor(payload, timestamp)).then(
      () => null,
      (error: unknown) => error,
    )
    expect((thrown as CogentaError).code).toBe('COMMERCE_PAYMENT_UNSUPPORTED')
  })
})

describe('PayPal driver availability', () => {
  it('answers false, never throws, when no credentials are configured', async () => {
    await expect(paypalPaymentDriver().available({})).resolves.toBe(false)
    await expect(paypalPaymentDriver().available({ clientId: 'x' })).resolves.toBe(false)
    await expect(paypalPaymentDriver().available({ clientSecret: 'y' })).resolves.toBe(false)
  })

  it('answers false, never throws, when nothing is listening on the configured address', async () => {
    const port = await findClosedPort()

    await expect(
      paypalPaymentDriver().available({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        apiBaseUrl: `http://127.0.0.1:${port}`,
      }),
    ).resolves.toBe(false)
  })

  it('answers false when the credentials are refused, and true when a token is issued', async () => {
    const stub = await startPayPalStub()
    try {
      stub.reply('POST /v1/oauth2/token', {
        status: 401,
        json: { error: 'invalid_client', error_description: 'Client Authentication failed' },
      })
      await expect(
        paypalPaymentDriver().available({
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          apiBaseUrl: stub.baseUrl,
        }),
      ).resolves.toBe(false)

      queueToken(stub)
      await expect(
        paypalPaymentDriver().available({
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          apiBaseUrl: stub.baseUrl,
        }),
      ).resolves.toBe(true)

      expect(stub.requests.at(0)?.authorization).toBe(
        `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`, 'utf8').toString('base64')}`,
      )
    } finally {
      await stub.close()
    }
  })

  it('reports its health without ever naming the credentials', async () => {
    const stub = await startPayPalStub()
    const driver = paypalPaymentDriver()
    try {
      expect((await driver.health()).status).toBe('down')

      await driver.init({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        apiBaseUrl: stub.baseUrl,
      })
      queueToken(stub)

      const report = await driver.health()
      expect(report.status).toBe('ok')
      expect(report.driver).toBe('paypal')
      expect(report.tier).toBe('optimal')
      expect(`${report.message ?? ''}${JSON.stringify(report.details ?? {})}`).not.toContain(
        CLIENT_SECRET,
      )
    } finally {
      await driver.dispose()
      await stub.close()
    }
  })

  it('refuses to initialise without a client id and secret rather than failing at the first order', async () => {
    const thrown = await paypalPaymentDriver()
      .init({})
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(thrown).toBeInstanceOf(CogentaError)
    expect((thrown as CogentaError).code).toBe('CONFIG_INVALID')
  })
})
