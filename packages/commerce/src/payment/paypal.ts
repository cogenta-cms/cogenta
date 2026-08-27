import { createVerify } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { CogentaError, type HealthReport, type Logger } from '@cogenta/core'
import { minorUnitExponent } from '../money.js'
import type {
  DriverRefundRequest,
  DriverRefundResult,
  PaymentConfig,
  PaymentDriver,
  PaymentEvent,
  PaymentGateway,
  PaymentStatus,
  StartedPayment,
  StartPaymentRequest,
} from './types.js'

/**
 * A second real payment driver, proving the same registered-interface
 * extensibility as `@cogenta/core`'s cache/queue/storage drivers: a shop is
 * not stuck choosing between Stripe and bank transfer — a third gateway
 * plugs into the exact same `PaymentDriver` interface (`start`/`fetch`/
 * `refund`/`verifyEvent`), registers itself once (`registry.ts`), and the
 * admin payment screen lists it without any change on its side.
 *
 * Written against PayPal's REST API (Orders v2 + Payments v2) with `fetch`,
 * the same choice `stripe.ts` made and for the same reason (R9): the `paypal-
 * server-sdk` package pulls a full generated client for four calls this
 * driver makes.
 *
 * Two real differences from Stripe shape this file:
 *
 * - PayPal has no long-lived secret key. It authenticates with an OAuth2
 *   client-credentials exchange (`clientId`/`clientSecret` → a bearer token
 *   that expires), so this driver caches and refreshes a token rather than
 *   sending one credential on every call.
 * - There is no single verb that both starts and settles a payment. An order
 *   is *created*, the shopper *approves* it on PayPal's site, and someone
 *   must *capture* it before money moves. This interface has no capture verb
 *   of its own, so `fetch()` — the same call the order store already makes to
 *   poll a payment after a shopper returns from a redirect — captures an
 *   approved order the moment it sees one. A second `fetch()` (or the
 *   confirming webhook) sees `COMPLETED` and does nothing further, because
 *   PayPal itself refuses a second capture on an already-captured order.
 */

/**
 * PayPal's live REST hostname. Unlike Stripe, sandbox and live are different
 * hosts (`api-m.sandbox.paypal.com` vs `api-m.paypal.com`) rather than a
 * prefix on the credential, so — exactly like the local HTTP stub `stripe.ts`
 * tests point `apiBaseUrl` at — a site testing against PayPal's sandbox sets
 * `payment.apiBaseUrl` explicitly. This default is the production host only.
 */
const DEFAULT_API_BASE_URL = 'https://api-m.paypal.com'

/** No official window is documented; this matches Stripe's, a defensible middle ground against replay. */
const SIGNATURE_FRESHNESS_WINDOW_SECONDS = 5 * 60

const REQUEST_TIMEOUT_MS = 20_000
const AVAILABILITY_TIMEOUT_MS = 3_000

/** A cached OAuth2 token is refreshed this long before it actually expires. */
const TOKEN_REFRESH_SKEW_MS = 30_000

/**
 * `GET /v2/checkout/orders/{id}` statuses, mapped onto this project's six.
 * `APPROVED` is deliberately absent: `fetch()` never returns it verbatim, it
 * always attempts a capture first and maps what capture produces instead —
 * see the file comment.
 */
const ORDER_STATUS_MAP: Readonly<Record<string, PaymentStatus>> = {
  CREATED: 'pending',
  SAVED: 'pending',
  PAYER_ACTION_REQUIRED: 'pending',
  VOIDED: 'cancelled',
  COMPLETED: 'paid',
}

/** `POST /v2/payments/captures/{id}/refund` statuses, mapped onto the three a `DriverRefundResult` carries. */
const REFUND_STATUS_MAP: Readonly<Record<string, DriverRefundResult['status']>> = {
  COMPLETED: 'refunded',
  PENDING: 'pending',
  CANCELLED: 'failed',
  FAILED: 'failed',
}

/**
 * The inbound webhook events this driver understands — every one a statement
 * about a *capture*, PayPal's event vocabulary for money actually moving.
 * `CHECKOUT.ORDER.APPROVED` is not here on purpose: approval is not payment,
 * and mapping it to anything would be exactly the guess Stripe's driver
 * refuses to make for an unrecognised intent status.
 */
const EVENT_TYPE_STATUS: Readonly<Record<string, PaymentStatus>> = {
  'PAYMENT.CAPTURE.COMPLETED': 'paid',
  'PAYMENT.CAPTURE.DENIED': 'failed',
  'PAYMENT.CAPTURE.REFUNDED': 'refunded',
  'PAYMENT.CAPTURE.REVERSED': 'refunded',
}

export interface PayPalDriverOptions {
  readonly logger?: Logger
  /** Injected so a freshness window and a token expiry can be tested without waiting. */
  readonly now?: () => number
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null
}

function asArray(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value : null
}

function readString(source: Readonly<Record<string, unknown>> | null, key: string): string | null {
  const value = source?.[key]
  return typeof value === 'string' && value !== '' ? value : null
}

function readPath(
  source: Readonly<Record<string, unknown>> | null,
  ...path: readonly string[]
): string | null {
  let current: Readonly<Record<string, unknown>> | null = source
  for (const key of path.slice(0, -1)) {
    current = asRecord(current?.[key])
  }
  const last = path[path.length - 1]
  return last === undefined ? null : readString(current, last)
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** PayPal's amount is a decimal string in major units, unlike this project's integer minor units everywhere else. */
function toDecimalAmount(amountMinor: number, currency: string): string {
  const exponent = minorUnitExponent(currency)
  return (amountMinor / 10 ** exponent).toFixed(exponent)
}

/** The inverse of `toDecimalAmount`. Null for anything that is not a finite decimal, never a guess. */
function fromDecimalAmount(value: string, currency: string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  const exponent = minorUnitExponent(currency)
  return Math.round(parsed * 10 ** exponent)
}

/** The `rel: "approve"` link is what the shopper is redirected to. Absent once an order has been captured. */
function approveLink(order: Readonly<Record<string, unknown>>): string | null {
  for (const entry of asArray(order.links) ?? []) {
    const link = asRecord(entry)
    if (link !== null && readString(link, 'rel') === 'approve') return readString(link, 'href')
  }
  return null
}

/** The capture id under a captured order — needed to refund, since a refund targets a capture, not an order. */
function findCaptureId(order: Readonly<Record<string, unknown>>): string | null {
  const unit = asArray(order.purchase_units)?.[0]
  const captures = asArray(asRecord(asRecord(unit)?.payments)?.captures)
  const capture = asRecord(captures?.[0])
  return readString(capture, 'id')
}

function paymentFailed(
  message: string,
  hint: string,
  details: Readonly<Record<string, unknown>>,
  cause?: unknown,
): CogentaError {
  return new CogentaError({
    code: 'COMMERCE_PAYMENT_FAILED',
    message,
    hint,
    details,
    ...(cause === undefined ? {} : { cause }),
  })
}

function signatureInvalid(reason: string): CogentaError {
  return new CogentaError({
    code: 'COMMERCE_PAYMENT_SIGNATURE_INVALID',
    message: `The PayPal webhook signature was refused: ${reason}.`,
    hint: 'Check that payment.webhookId matches the webhook shown in the PayPal dashboard, that the raw request body is passed unparsed, and that the clock on this server is correct.',
    details: { reason },
  })
}

/** Header names arrive however the HTTP server spelled them; PayPal's are lower-case with hyphens. */
function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value
  }
  return undefined
}

/**
 * Is this certificate URL one this driver should ever fetch and trust?
 *
 * A forged `paypal-cert-url` header pointing at an attacker's own server,
 * paired with a signature made from the attacker's own key, would otherwise
 * "verify" against a certificate the attacker controls — the classic webhook-
 * spoofing vector. Trusted origins are: the exact host this driver is already
 * talking to (what makes a local test stub, serving both the API and a
 * fixture certificate, workable — the same escape hatch `apiBaseUrl` already
 * grants Stripe's tests), or any real PayPal host over HTTPS.
 */
function isTrustedCertUrl(certUrl: string, baseUrl: string): boolean {
  let cert: URL
  let base: URL
  try {
    cert = new URL(certUrl)
    base = new URL(baseUrl)
  } catch {
    return false
  }
  if (cert.origin === base.origin) return true
  return (
    cert.protocol === 'https:' &&
    (cert.hostname === 'paypal.com' || cert.hostname.endsWith('.paypal.com'))
  )
}

function createPayPalGateway(
  clientId: string,
  clientSecret: string,
  baseUrl: string,
  webhookId: string | undefined,
  options: PayPalDriverOptions,
): PaymentGateway {
  const now = options.now ?? Date.now
  const logger = options.logger

  let cachedToken: { readonly token: string; readonly expiresAt: number } | undefined
  const certCache = new Map<string, string>()

  async function ensureToken(): Promise<string> {
    if (cachedToken !== undefined && cachedToken.expiresAt - TOKEN_REFRESH_SKEW_MS > now()) {
      return cachedToken.token
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')
    let response: Response
    try {
      response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${basic}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw paymentFailed(
        'PayPal could not be reached to obtain an access token.',
        'Check outbound network access from this server, and whether PayPal is reporting an incident.',
        {},
        error,
      )
    }

    const text = await response.text()
    const body = asRecord(text === '' ? null : safeJsonParse(text))
    if (!response.ok) {
      throw paymentFailed(
        `PayPal refused the OAuth2 token request with HTTP ${response.status}.`,
        'Check that payment.clientId and payment.clientSecret are a valid PayPal REST app pair, and that they match this apiBaseUrl (sandbox credentials do not work against the live host, and vice versa).',
        { status: response.status },
      )
    }

    const token = readString(body, 'access_token')
    if (token === null) {
      throw paymentFailed(
        'PayPal answered the token request without an access_token.',
        'Retry; if it recurs, check the PayPal REST app configuration.',
        { received: body === null ? [] : Object.keys(body) },
      )
    }

    const expiresIn = typeof body?.expires_in === 'number' ? body.expires_in : 300
    cachedToken = { token, expiresAt: now() + expiresIn * 1000 }
    return token
  }

  async function call(
    path: string,
    init: { readonly method: 'GET' | 'POST'; readonly json?: unknown },
  ): Promise<Readonly<Record<string, unknown>>> {
    const token = await ensureToken()
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.json === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw paymentFailed(
        `PayPal could not be reached for ${init.method} ${path}.`,
        'Check outbound network access from this server, and whether PayPal is reporting an incident.',
        { path, method: init.method },
        error,
      )
    }

    const text = await response.text()
    const parsed: unknown = text === '' ? null : safeJsonParse(text)
    const body = asRecord(parsed)

    if (!response.ok) {
      const issue = readString(asRecord(asArray(body?.details)?.[0]), 'issue')
      throw paymentFailed(
        `PayPal refused ${init.method} ${path} with HTTP ${response.status}: ${
          readString(body, 'message') ?? 'no reason given'
        }`,
        'Check the amount, the currency and the order state in the PayPal dashboard; a 401 means the access token expired or the app credentials are wrong.',
        {
          path,
          method: init.method,
          status: response.status,
          // PayPal's own identifiers for the failure. Never the credentials.
          paypalName: readString(body, 'name'),
          paypalIssue: issue,
        },
      )
    }

    if (body === null) {
      throw paymentFailed(
        `PayPal answered ${init.method} ${path} with something that is not a JSON object.`,
        'This is usually a proxy or a captive portal answering instead of PayPal; check payment.apiBaseUrl and the outbound route.',
        { path, method: init.method, status: response.status },
      )
    }

    return body
  }

  function mapOrderStatus(status: string | null, externalId: string | null): PaymentStatus {
    const mapped = status === null ? undefined : ORDER_STATUS_MAP[status]
    if (mapped !== undefined) return mapped

    logger?.warn('PayPal reported an order status this driver does not know.', {
      driver: 'paypal',
      paypalStatus: status,
      externalId,
      mappedTo: 'failed',
    })
    return 'failed'
  }

  function toStartedPayment(
    order: Readonly<Record<string, unknown>>,
    knownId?: string,
  ): StartedPayment {
    const externalId = readString(order, 'id') ?? knownId ?? null
    if (externalId === null) {
      throw paymentFailed(
        'PayPal returned an order without an id.',
        'Retry the payment; if it recurs, check the PayPal API version configured on the account.',
        { received: Object.keys(order) },
      )
    }

    return {
      externalId,
      status: mapOrderStatus(readString(order, 'status'), externalId),
      instructions: approveLink(order),
    }
  }

  /**
   * Captures an approved order, tolerating the one race this interface
   * exposes: two concurrent `fetch()` calls (a shopper's browser polling
   * while a webhook also arrives) can both see `APPROVED` and both attempt a
   * capture. PayPal accepts the first and refuses the second with
   * `ORDER_ALREADY_CAPTURED` — refused, not failed, so the true status is
   * read back with a plain `GET` instead of surfacing that refusal to the
   * order store.
   */
  async function captureOrRefetch(externalId: string): Promise<Readonly<Record<string, unknown>>> {
    try {
      return await call(`/v2/checkout/orders/${encodeURIComponent(externalId)}/capture`, {
        method: 'POST',
      })
    } catch (error) {
      const issue =
        error instanceof CogentaError && typeof error.details?.paypalIssue === 'string'
          ? error.details.paypalIssue
          : null
      if (issue !== 'ORDER_ALREADY_CAPTURED') throw error
      return call(`/v2/checkout/orders/${encodeURIComponent(externalId)}`, { method: 'GET' })
    }
  }

  async function loadCert(certUrl: string): Promise<string> {
    const cached = certCache.get(certUrl)
    if (cached !== undefined) return cached

    let response: Response
    try {
      response = await fetch(certUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    } catch {
      throw signatureInvalid(`the certificate at "${certUrl}" could not be fetched`)
    }
    if (!response.ok) {
      throw signatureInvalid(`the certificate endpoint answered HTTP ${response.status}`)
    }
    const pem = await response.text()
    certCache.set(certUrl, pem)
    return pem
  }

  return {
    name: 'paypal',
    settlesOffline: false,

    start: async (request: StartPaymentRequest): Promise<StartedPayment> => {
      const order = await call('/v2/checkout/orders', {
        method: 'POST',
        json: {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: request.orderReference,
              ...(request.description === undefined ? {} : { description: request.description }),
              amount: {
                currency_code: request.currency.toUpperCase(),
                value: toDecimalAmount(request.amountMinor, request.currency),
              },
            },
          ],
          ...(request.returnUrl === undefined
            ? {}
            : {
                application_context: {
                  return_url: request.returnUrl,
                  cancel_url: request.returnUrl,
                  user_action: 'PAY_NOW',
                },
              }),
        },
      })

      return toStartedPayment(order)
    },

    /**
     * Re-reads the order, and — see the file comment — captures it first if
     * the shopper has approved it but nobody has taken the money yet. This is
     * the one call in the interface that both starts a network request and
     * ends up moving funds, which is unusual for a `fetch`; it is unusual
     * because PayPal's checkout has no other verb this narrow interface could
     * call it from.
     */
    fetch: async (externalId: string): Promise<StartedPayment> => {
      const order = await call(`/v2/checkout/orders/${encodeURIComponent(externalId)}`, {
        method: 'GET',
      })
      if (readString(order, 'status') !== 'APPROVED') return toStartedPayment(order, externalId)

      return toStartedPayment(await captureOrRefetch(externalId), externalId)
    },

    refund: async (request: DriverRefundRequest): Promise<DriverRefundResult> => {
      // `externalId` is the order id this driver stores throughout a
      // payment's life (see the file comment); a refund targets the capture
      // underneath it, which only exists once the order has settled.
      const order = await call(`/v2/checkout/orders/${encodeURIComponent(request.externalId)}`, {
        method: 'GET',
      })
      const captureId = findCaptureId(order)
      if (captureId === null) {
        throw paymentFailed(
          `PayPal order ${request.externalId} has not been captured yet, so there is nothing to refund.`,
          'A payment can only be refunded once it has settled.',
          { externalId: request.externalId },
        )
      }

      const refund = await call(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
        method: 'POST',
        json: {
          amount: {
            currency_code: request.currency.toUpperCase(),
            value: toDecimalAmount(request.amountMinor, request.currency),
          },
          ...(request.reason === undefined ? {} : { note_to_payer: request.reason }),
        },
      })

      const status = readString(refund, 'status')
      const mapped = status === null ? undefined : REFUND_STATUS_MAP[status]
      if (mapped === undefined) {
        logger?.warn('PayPal reported a refund status this driver does not know.', {
          driver: 'paypal',
          paypalStatus: status,
          captureId,
          mappedTo: 'failed',
        })
      }

      return { externalId: readString(refund, 'id'), status: mapped ?? 'failed' }
    },

    verifyEvent: async (
      payload: string,
      headers: Readonly<Record<string, string>>,
    ): Promise<PaymentEvent> => {
      if (webhookId === undefined || webhookId === '') {
        throw signatureInvalid('no webhook id is configured for this site')
      }

      const transmissionId = headerValue(headers, 'paypal-transmission-id')
      const transmissionTime = headerValue(headers, 'paypal-transmission-time')
      const certUrl = headerValue(headers, 'paypal-cert-url')
      const authAlgo = headerValue(headers, 'paypal-auth-algo')
      const signature = headerValue(headers, 'paypal-transmission-sig')

      if (transmissionId === undefined || transmissionId === '') {
        throw signatureInvalid('no paypal-transmission-id header')
      }
      if (transmissionTime === undefined || transmissionTime === '') {
        throw signatureInvalid('no paypal-transmission-time header')
      }
      if (certUrl === undefined || certUrl === '')
        throw signatureInvalid('no paypal-cert-url header')
      if (signature === undefined || signature === '') {
        throw signatureInvalid('no paypal-transmission-sig header')
      }

      const transmittedAtMs = Date.parse(transmissionTime)
      if (Number.isNaN(transmittedAtMs)) {
        throw signatureInvalid('the paypal-transmission-time header carried no usable timestamp')
      }
      // Freshness before authenticity, same reasoning as Stripe's driver: a
      // captured, genuinely-signed delivery stays genuinely signed forever, so
      // the window is what stops a replay.
      const ageSeconds = Math.abs(Math.floor(now() / 1000) - Math.floor(transmittedAtMs / 1000))
      if (ageSeconds > SIGNATURE_FRESHNESS_WINDOW_SECONDS) {
        throw signatureInvalid(
          `the transmission timestamp is ${ageSeconds}s away from now, outside the ${SIGNATURE_FRESHNESS_WINDOW_SECONDS}s window`,
        )
      }

      if (!isTrustedCertUrl(certUrl, baseUrl)) {
        throw signatureInvalid(`the certificate url "${certUrl}" is not a trusted PayPal host`)
      }

      const algorithm =
        authAlgo === undefined || authAlgo.toUpperCase() === 'SHA256WITHRSA' ? 'RSA-SHA256' : null
      if (algorithm === null) throw signatureInvalid(`unsupported signing algorithm "${authAlgo}"`)

      const cert = await loadCert(certUrl)
      // PayPal's own documented scheme: the CRC32 of the raw body, as the
      // unsigned decimal integer (never hex) it defines the string as.
      const crc = (crc32(payload) >>> 0).toString(10)
      const expectedMessage = `${transmissionId}|${transmissionTime}|${webhookId}|${crc}`

      let verified: boolean
      try {
        verified = createVerify(algorithm).update(expectedMessage).verify(cert, signature, 'base64')
      } catch {
        verified = false
      }
      if (!verified) throw signatureInvalid('the signature did not match the transmitted event')

      const event = asRecord(safeJsonParse(payload))
      const type = readString(event, 'event_type')
      const status = type === null ? undefined : EVENT_TYPE_STATUS[type]

      if (status === undefined) {
        throw new CogentaError({
          code: 'COMMERCE_PAYMENT_UNSUPPORTED',
          message: `This driver has no reading for the PayPal event "${type ?? 'unknown'}".`,
          hint: `Narrow the webhook in the PayPal dashboard to ${Object.keys(EVENT_TYPE_STATUS).join(', ')}.`,
          details: { eventType: type },
        })
      }

      const resource = asRecord(event?.resource)
      // A capture event's `resource` is the Capture, not the Order — the
      // order id this driver stores as `externalId` throughout a payment's
      // life lives one level down, in `supplementary_data.related_ids`.
      const orderId = readPath(resource, 'supplementary_data', 'related_ids', 'order_id')
      if (orderId === null) {
        throw paymentFailed(
          `The PayPal event "${type}" carried no order identifier.`,
          'Check that the webhook is subscribed to capture events, which carry supplementary_data.related_ids.order_id.',
          { eventType: type },
        )
      }

      const amount = asRecord(resource?.amount)
      const currency = readString(amount, 'currency_code')
      const rawAmount = readString(amount, 'value')
      const amountMinor =
        currency === null || rawAmount === null ? null : fromDecimalAmount(rawAmount, currency)

      return {
        externalId: orderId,
        // Unlike Stripe's payment intents, a capture webhook carries no
        // reference back to `purchase_units[].reference_id` — only the order
        // itself does. Honest null rather than a guess (same discipline as
        // an unrecognised status mapping to `failed` above, not to `paid`).
        orderReference: null,
        status,
        amountMinor,
        currency: currency === null ? null : currency.toUpperCase(),
      }
    },
  }
}

function hasCredentials(config: PaymentConfig): config is PaymentConfig & {
  clientId: string
  clientSecret: string
} {
  return (
    config.clientId !== undefined &&
    config.clientId !== '' &&
    config.clientSecret !== undefined &&
    config.clientSecret !== ''
  )
}

export function paypalPaymentDriver(options: PayPalDriverOptions = {}): PaymentDriver {
  let gateway: PaymentGateway | undefined
  let probe:
    | { readonly clientId: string; readonly clientSecret: string; readonly baseUrl: string }
    | undefined

  const resolveBaseUrl = (config: PaymentConfig): string =>
    (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '')

  async function probeToken(
    clientId: string,
    clientSecret: string,
    baseUrl: string,
  ): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
      })
      // The body is drained so the socket is released rather than left open
      // for the timeout to reap.
      await response.text()
      return response.ok
    } catch {
      return false
    }
  }

  return {
    name: 'paypal',
    tier: 'optimal',

    /**
     * Does PayPal actually issue a token for this client id/secret pair? Not
     * "are both fields set?" — same discipline as Stripe's `available()`, and
     * for the same reason: the registry reads a `false` as "fall through",
     * so this must never throw and never hang a startup.
     */
    available: async (config: PaymentConfig): Promise<boolean> => {
      if (!hasCredentials(config)) return false
      return probeToken(config.clientId, config.clientSecret, resolveBaseUrl(config))
    },

    init: async (config: PaymentConfig): Promise<PaymentGateway> => {
      if (!hasCredentials(config)) {
        throw new CogentaError({
          code: 'CONFIG_INVALID',
          message: 'The PayPal payment driver needs a client id and a client secret.',
          hint: 'Set payment.clientId and payment.clientSecret (or the COGENTA_PAYMENT_PAYPAL_CLIENT_ID / COGENTA_PAYMENT_PAYPAL_CLIENT_SECRET environment variables), or leave payment.driver unset to be paid by bank transfer.',
        })
      }

      const baseUrl = resolveBaseUrl(config)
      probe = { clientId: config.clientId, clientSecret: config.clientSecret, baseUrl }
      gateway ??= createPayPalGateway(
        config.clientId,
        config.clientSecret,
        baseUrl,
        config.webhookId,
        options,
      )
      return gateway
    },

    dispose: async (): Promise<void> => {
      // Nothing to close: every call is a one-shot `fetch`; the cached OAuth2
      // token dies with the gateway closure.
      gateway = undefined
      probe = undefined
    },

    health: async (): Promise<HealthReport> => {
      if (probe === undefined) {
        return { status: 'down', driver: 'paypal', tier: 'optimal', message: 'Not configured.' }
      }

      const startedAt = Date.now()
      const ok = await probeToken(probe.clientId, probe.clientSecret, probe.baseUrl)
      return ok
        ? {
            status: 'ok',
            driver: 'paypal',
            tier: 'optimal',
            latencyMs: Date.now() - startedAt,
            // The credentials are never named, not even partially.
            message: 'PayPal answered.',
          }
        : {
            status: 'down',
            driver: 'paypal',
            tier: 'optimal',
            latencyMs: Date.now() - startedAt,
            message: 'PayPal did not answer the OAuth2 token request.',
          }
    },
  }
}
