import { createHmac, timingSafeEqual } from 'node:crypto'
import { CogentaError, type HealthReport, type Logger } from '@cogenta/core'
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
 * The optimal payment driver: a real Stripe client, written against Stripe's
 * REST API rather than the `stripe` npm package.
 *
 * Rule R9 — "préférer zéro dépendance à une petite dépendance". The `stripe`
 * package is neither small nor free: it pulls a full HTTP stack and a very
 * large set of generated types for the four calls this driver makes. The same
 * precedent already exists in this codebase (`@cogenta/channels`' hand-written
 * Telegram/Slack/Discord clients, `@cogenta/import`'s hand-rolled WXR parser).
 *
 * The wire format is not guessed: Stripe's API takes
 * `application/x-www-form-urlencoded` in, answers JSON, and authenticates with
 * `Authorization: Bearer <secret key>`. Nested keys use the bracket syntax
 * (`metadata[order_reference]`), which `URLSearchParams` encodes correctly.
 */

const DEFAULT_API_BASE_URL = 'https://api.stripe.com'

/** Stripe's own recommendation for a webhook freshness window. */
const SIGNATURE_FRESHNESS_WINDOW_SECONDS = 5 * 60

/** Long enough for a real payment call, short enough that a hung TCP connection is not a hung checkout. */
const REQUEST_TIMEOUT_MS = 20_000

/** An availability probe answers fast or it does not answer: the registry is waiting to fall through. */
const AVAILABILITY_TIMEOUT_MS = 3_000

/**
 * Stripe's PaymentIntent vocabulary, mapped onto the six statuses of the
 * `PaymentGateway` contract. Everything before the money moves is `pending`;
 * a manual-capture intent holding funds is `authorised`.
 */
const INTENT_STATUS_MAP: Readonly<Record<string, PaymentStatus>> = {
  requires_payment_method: 'pending',
  requires_confirmation: 'pending',
  requires_action: 'pending',
  processing: 'pending',
  requires_capture: 'authorised',
  succeeded: 'paid',
  canceled: 'cancelled',
}

/** Stripe's Refund vocabulary, mapped onto the three a `DriverRefundResult` carries. */
const REFUND_STATUS_MAP: Readonly<Record<string, DriverRefundResult['status']>> = {
  pending: 'pending',
  requires_action: 'pending',
  succeeded: 'refunded',
  failed: 'failed',
  canceled: 'failed',
}

/**
 * The inbound events this driver understands. Every one of them is a statement
 * about where the money is; an event type outside this table is refused rather
 * than mapped to a guess, because guessing "paid" is how goods leave for free.
 */
const EVENT_TYPE_STATUS: Readonly<Record<string, PaymentStatus>> = {
  'payment_intent.succeeded': 'paid',
  'payment_intent.payment_failed': 'failed',
  'payment_intent.canceled': 'cancelled',
  'charge.refunded': 'refunded',
}

export interface StripeDriverOptions {
  /** Optional: without one, an unknown Stripe status is mapped to `failed` silently. */
  readonly logger?: Logger
  /** Injected so a freshness window can be tested without waiting five minutes. */
  readonly now?: () => number
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null
}

function readString(source: Readonly<Record<string, unknown>> | null, key: string): string | null {
  const value = source?.[key]
  return typeof value === 'string' && value !== '' ? value : null
}

function readNumber(source: Readonly<Record<string, unknown>> | null, key: string): number | null {
  const value = source?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The one place a Stripe failure becomes a Cogenta failure.
 *
 * `details` carries the status code and Stripe's own error identifiers, and
 * nothing else — never the request headers, never the URL with credentials,
 * never the secret key (rule R7). An operator gets what they need to find the
 * call in the Stripe dashboard; a log reader gets nothing they could spend.
 */
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
    message: `The Stripe webhook signature was refused: ${reason}.`,
    hint: 'Check that payment.webhookSecret matches the signing secret shown for this endpoint in the Stripe dashboard, that the raw request body is passed unparsed, and that the clock on this server is correct.',
    details: { reason },
  })
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Same discipline as `@cogenta/channels`' inbound webhook verification: length
 * is checked first because `timingSafeEqual` throws on a mismatch, and the
 * comparison itself never short-circuits on the first differing byte.
 */
function digestsMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(received, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

interface ParsedSignatureHeader {
  readonly timestamp: number | null
  readonly signatures: readonly string[]
}

/**
 * Parses `t=1614556800,v1=<hex>,v1=<hex>`.
 *
 * More than one `v1` is normal, not an anomaly: during a signing-secret
 * rotation Stripe signs each delivery with both secrets, and an endpoint that
 * only looks at the first one goes deaf halfway through the rotation.
 */
function parseSignatureHeader(header: string): ParsedSignatureHeader {
  let timestamp: number | null = null
  const signatures: string[] = []

  for (const part of header.split(',')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()

    if (key === 't') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) timestamp = parsed
    } else if (key === 'v1' && value !== '') {
      signatures.push(value)
    }
  }

  return { timestamp, signatures }
}

/** Header names arrive however the HTTP server spelled them; Stripe's is `stripe-signature`. */
function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value
  }
  return undefined
}

/**
 * A real Stripe gateway.
 *
 * `stripePaymentDriver()` is the driver (selection, availability, health);
 * this is the instance it hands back once a secret key is known to exist.
 */
function createStripeGateway(
  secretKey: string,
  baseUrl: string,
  webhookSecret: string | undefined,
  options: StripeDriverOptions,
): PaymentGateway {
  const now = options.now ?? Date.now
  const logger = options.logger

  async function call(
    path: string,
    init: { readonly method: 'GET' | 'POST'; readonly form?: URLSearchParams },
  ): Promise<Readonly<Record<string, unknown>>> {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          authorization: `Bearer ${secretKey}`,
          ...(init.form === undefined
            ? {}
            : { 'content-type': 'application/x-www-form-urlencoded' }),
        },
        ...(init.form === undefined ? {} : { body: init.form.toString() }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw paymentFailed(
        `Stripe could not be reached for ${init.method} ${path}.`,
        'Check outbound network access from this server, and whether Stripe is reporting an incident.',
        { path, method: init.method },
        error,
      )
    }

    const text = await response.text()
    const parsed: unknown = text === '' ? null : safeJsonParse(text)
    const body = asRecord(parsed)

    if (!response.ok) {
      const stripeError = asRecord(body?.error)
      throw paymentFailed(
        `Stripe refused ${init.method} ${path} with HTTP ${response.status}: ${
          readString(stripeError, 'message') ?? 'no reason given'
        }`,
        'Check the amount, the currency and the payment method in the Stripe dashboard; a 401 means the secret key is wrong or revoked.',
        {
          path,
          method: init.method,
          status: response.status,
          // Stripe's own identifiers for the failure. Never the key, never the
          // request headers.
          stripeErrorType: readString(stripeError, 'type'),
          stripeErrorCode: readString(stripeError, 'code'),
        },
      )
    }

    if (body === null) {
      throw paymentFailed(
        `Stripe answered ${init.method} ${path} with something that is not a JSON object.`,
        'This is usually a proxy or a captive portal answering instead of Stripe; check payment.apiBaseUrl and the outbound route.',
        { path, method: init.method, status: response.status },
      )
    }

    return body
  }

  function safeJsonParse(text: string): unknown {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  /** An unknown status is reported, never guessed: `failed` is the safe reading. */
  function mapIntentStatus(status: string | null, externalId: string | null): PaymentStatus {
    const mapped = status === null ? undefined : INTENT_STATUS_MAP[status]
    if (mapped !== undefined) return mapped

    logger?.warn('Stripe reported a payment intent status this driver does not know.', {
      driver: 'stripe',
      stripeStatus: status,
      externalId,
      mappedTo: 'failed',
    })
    return 'failed'
  }

  function toStartedPayment(intent: Readonly<Record<string, unknown>>): StartedPayment {
    const externalId = readString(intent, 'id')
    if (externalId === null) {
      throw paymentFailed(
        'Stripe returned a payment intent without an id.',
        'Retry the payment; if it recurs, check the Stripe API version configured on the account.',
        { received: Object.keys(intent) },
      )
    }

    return {
      externalId,
      status: mapIntentStatus(readString(intent, 'status'), externalId),
      // The client secret is what the shopper's browser needs to finish the
      // payment. It is scoped to this one intent and is meant to reach the
      // front end — it is not an account credential.
      instructions: readString(intent, 'client_secret'),
    }
  }

  return {
    name: 'stripe',
    settlesOffline: false,

    start: async (request: StartPaymentRequest): Promise<StartedPayment> => {
      const form = new URLSearchParams()
      form.set('amount', String(request.amountMinor))
      // Stripe rejects an upper-case code.
      form.set('currency', request.currency.toLowerCase())
      // The reference, not the internal id: this is what comes back on the
      // webhook and what a human reads on a statement.
      form.set('metadata[order_reference]', request.orderReference)
      form.set('receipt_email', request.customerEmail)
      // Lets the account's own payment-method settings decide what the shopper
      // is offered, instead of hard-coding "card" here.
      form.set('automatic_payment_methods[enabled]', 'true')
      if (request.description !== undefined) form.set('description', request.description)

      return toStartedPayment(await call('/v1/payment_intents', { method: 'POST', form }))
    },

    fetch: async (externalId: string): Promise<StartedPayment> =>
      toStartedPayment(
        await call(`/v1/payment_intents/${encodeURIComponent(externalId)}`, { method: 'GET' }),
      ),

    refund: async (request: DriverRefundRequest): Promise<DriverRefundResult> => {
      const form = new URLSearchParams()
      form.set('payment_intent', request.externalId)
      // Always explicit: omitting it refunds the whole intent, which is not
      // what a partial refund asked for.
      form.set('amount', String(request.amountMinor))

      const refund = await call('/v1/refunds', { method: 'POST', form })
      const status = readString(refund, 'status')
      const mapped = status === null ? undefined : REFUND_STATUS_MAP[status]

      if (mapped === undefined) {
        logger?.warn('Stripe reported a refund status this driver does not know.', {
          driver: 'stripe',
          stripeStatus: status,
          paymentIntent: request.externalId,
          mappedTo: 'failed',
        })
      }

      return { externalId: readString(refund, 'id'), status: mapped ?? 'failed' }
    },

    verifyEvent: async (
      payload: string,
      headers: Readonly<Record<string, string>>,
    ): Promise<PaymentEvent> => {
      const header = headerValue(headers, 'stripe-signature')
      if (header === undefined || header === '')
        throw signatureInvalid('no stripe-signature header')
      if (webhookSecret === undefined || webhookSecret === '') {
        throw signatureInvalid('no webhook secret is configured for this site')
      }

      const { timestamp, signatures } = parseSignatureHeader(header)
      if (timestamp === null) throw signatureInvalid('the header carried no usable timestamp')
      if (signatures.length === 0) throw signatureInvalid('the header carried no v1 signature')

      // Freshness before authenticity: a captured, genuinely-signed delivery
      // stays genuinely signed forever, so the window is what stops a replay.
      const ageSeconds = Math.abs(Math.floor(now() / 1000) - timestamp)
      if (ageSeconds > SIGNATURE_FRESHNESS_WINDOW_SECONDS) {
        throw signatureInvalid(
          `the signed timestamp is ${ageSeconds}s away from now, outside the ${SIGNATURE_FRESHNESS_WINDOW_SECONDS}s window`,
        )
      }

      const expected = createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${payload}`)
        .digest('hex')
      // Every v1 is tried, and the loop never breaks early on a match, so the
      // number of comparisons does not depend on which secret signed it.
      let matched = false
      for (const candidate of signatures) {
        if (digestsMatch(expected, candidate)) matched = true
      }
      if (!matched) throw signatureInvalid('no v1 signature matched the configured secret')

      const event = asRecord(safeJsonParse(payload))
      const type = readString(event, 'type')
      const status = type === null ? undefined : EVENT_TYPE_STATUS[type]

      if (status === undefined) {
        throw new CogentaError({
          code: 'COMMERCE_PAYMENT_UNSUPPORTED',
          message: `This driver has no reading for the Stripe event "${type ?? 'unknown'}".`,
          hint: `Narrow the endpoint in the Stripe dashboard to ${Object.keys(EVENT_TYPE_STATUS).join(', ')}.`,
          details: { eventType: type },
        })
      }

      const object = asRecord(asRecord(event?.data)?.object)
      // On a charge, the intent lives in `payment_intent`; on an intent, it is
      // the object's own id. The store keys payments by the intent either way.
      const externalId =
        type === 'charge.refunded'
          ? (readString(object, 'payment_intent') ?? readString(object, 'id'))
          : readString(object, 'id')

      if (externalId === null) {
        throw paymentFailed(
          `The Stripe event "${type}" carried no payment identifier.`,
          'Check the API version configured on the Stripe account: an older version shapes this event differently.',
          { eventType: type },
        )
      }

      const amountMinor =
        type === 'charge.refunded'
          ? (readNumber(object, 'amount_refunded') ?? readNumber(object, 'amount'))
          : readNumber(object, 'amount')
      const currency = readString(object, 'currency')

      return {
        externalId,
        orderReference: readString(asRecord(object?.metadata), 'order_reference'),
        status,
        amountMinor,
        // Stripe sends a lower-case code; every stored record in this package
        // holds the ISO 4217 upper-case one.
        currency: currency === null ? null : currency.toUpperCase(),
      }
    },
  }
}

export function stripePaymentDriver(options: StripeDriverOptions = {}): PaymentDriver {
  let gateway: PaymentGateway | undefined
  let probe: { readonly secretKey: string; readonly baseUrl: string } | undefined

  const resolveBaseUrl = (config: PaymentConfig): string =>
    (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '')

  return {
    name: 'stripe',
    tier: 'optimal',

    /**
     * Does Stripe actually answer with this key? Not "is a key configured?" —
     * the registry reads a `false` as "fall through to the offline driver", so
     * this must never throw, and must never hang a startup either.
     */
    available: async (config: PaymentConfig): Promise<boolean> => {
      if (config.secretKey === undefined || config.secretKey === '') return false

      try {
        const response = await fetch(`${resolveBaseUrl(config)}/v1/balance`, {
          method: 'GET',
          headers: { authorization: `Bearer ${config.secretKey}` },
          signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
        })
        // The body is drained so the socket is released rather than left open
        // for the timeout to reap.
        await response.text()
        return response.ok
      } catch {
        return false
      }
    },

    init: async (config: PaymentConfig): Promise<PaymentGateway> => {
      if (config.secretKey === undefined || config.secretKey === '') {
        throw new CogentaError({
          code: 'CONFIG_INVALID',
          message: 'The Stripe payment driver needs a secret key.',
          hint: 'Set payment.secretKey (or the COGENTA_PAYMENT_SECRET_KEY environment variable), or leave payment.driver unset to be paid by bank transfer.',
        })
      }

      const baseUrl = resolveBaseUrl(config)
      probe = { secretKey: config.secretKey, baseUrl }
      gateway ??= createStripeGateway(config.secretKey, baseUrl, config.webhookSecret, options)
      return gateway
    },

    dispose: async (): Promise<void> => {
      // Nothing to close: every call is a one-shot `fetch`.
      gateway = undefined
      probe = undefined
    },

    health: async (): Promise<HealthReport> => {
      if (probe === undefined) {
        return { status: 'down', driver: 'stripe', tier: 'optimal', message: 'Not configured.' }
      }

      const startedAt = Date.now()
      try {
        const response = await fetch(`${probe.baseUrl}/v1/balance`, {
          method: 'GET',
          headers: { authorization: `Bearer ${probe.secretKey}` },
          signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
        })
        await response.text()

        return response.ok
          ? {
              status: 'ok',
              driver: 'stripe',
              tier: 'optimal',
              latencyMs: Date.now() - startedAt,
              // The key is never named, not even partially.
              message: 'Stripe answered.',
            }
          : {
              status: 'down',
              driver: 'stripe',
              tier: 'optimal',
              latencyMs: Date.now() - startedAt,
              message: `Stripe refused the account check with HTTP ${response.status}.`,
              details: { status: response.status },
            }
      } catch {
        return {
          status: 'down',
          driver: 'stripe',
          tier: 'optimal',
          message: 'Stripe did not answer.',
        }
      }
    },
  }
}
