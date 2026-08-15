import { CogentaError } from '@cogenta/core'
import type { WebhookFetch } from './adapter.js'
import {
  signOutgoingWebhook,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from './signing.js'

/**
 * The outbound half of "un webhook réellement branché sur le cycle de vie du
 * contenu" (L14 task 1).
 *
 * Why this is not `createWebhookAdapter`: that adapter carries a
 * `ChannelMessage`, a *human* message — title and prose, rendered for someone
 * to read (`render.ts`). A `content.publish` webhook is consumed by a machine:
 * a headless frontend invalidating a page, a CI job rebuilding a static site,
 * an automation platform. Handing it `{ level: 'notification', title, text }`
 * would force every receiver to parse a sentence to find out which entry
 * changed. So the *payload* differs — and only the payload.
 *
 * Everything security-relevant is the existing primitive, used verbatim:
 * `signOutgoingWebhook` (HMAC-SHA256 over `` `${timestamp}.${rawBody}` ``),
 * the same two headers, the same freshness semantics. A receiver verifies an
 * event exactly as it verifies a message — with `verifyIncomingWebhook`, no
 * argument changed — which is the property the end-to-end test asserts. There
 * is deliberately no second signing code path in this repository.
 */

/** What a receiver gets, as JSON, in the body of a signed POST. */
export interface WebhookEventEnvelope {
  /** Stable, dotted event name, e.g. `content.publish`. */
  readonly event: string
  /** ISO 8601, the instant the site decided the event happened. */
  readonly occurredAt: string
  /** Event-specific facts. Never the content body itself — see `deliver`. */
  readonly data: Readonly<Record<string, unknown>>
}

export interface WebhookEventDelivery {
  readonly url: string
  readonly delivered: boolean
  /** The receiver's HTTP status, or `null` when the request never got one (network error). */
  readonly status: number | null
  /** Present exactly when `delivered` is `false`. */
  readonly error?: CogentaError
}

export interface WebhookEventSenderOptions {
  /** Every URL the site notifies. Empty means the sender is a no-op. */
  readonly endpoints: readonly string[]
  /** Shared with every endpoint — the same secret their `verifyIncomingWebhook` uses. */
  readonly secret: string
  /** Defaults to the global `fetch`; overridable for tests. */
  readonly fetchImpl?: WebhookFetch
  /** Injectable so tests can pin time; nothing else should pass it. */
  readonly now?: () => number
}

export interface WebhookEventSender {
  readonly endpoints: readonly string[]
  /**
   * Signs one envelope and POSTs it to every endpoint, in parallel.
   *
   * **Never throws, and never rejects.** The caller is a content write that has
   * already succeeded: an editor's publish must not fail because somebody
   * else's HTTP endpoint is down. Every outcome — including a refusal — comes
   * back as a `WebhookEventDelivery` so the caller can log it, which is what
   * makes the side effect visible rather than silent.
   *
   * There is no retry and no durable queue on purpose: this repository
   * guarantees no persistent worker (rule R1), so a retry loop here would be a
   * promise the deployment cannot keep. A receiver that needs at-least-once
   * delivery polls the API; a receiver that misses one event is told so by the
   * next one.
   */
  send(
    event: string,
    data: Readonly<Record<string, unknown>>,
  ): Promise<readonly WebhookEventDelivery[]>
}

export function createWebhookEventSender(options: WebhookEventSenderOptions): WebhookEventSender {
  const fetchImpl: WebhookFetch = options.fetchImpl ?? (fetch as unknown as WebhookFetch)
  const now = options.now ?? Date.now
  const endpoints = Object.freeze([...options.endpoints])

  async function deliverOne(url: string, rawBody: string): Promise<WebhookEventDelivery> {
    const signed = signOutgoingWebhook(options.secret, rawBody, Math.floor(now() / 1000))
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [WEBHOOK_TIMESTAMP_HEADER]: signed.timestamp,
          [WEBHOOK_SIGNATURE_HEADER]: signed.signature,
        },
        body: rawBody,
      })
      if (response.ok) return { url, delivered: true, status: response.status }
      return {
        url,
        delivered: false,
        status: response.status,
        error: new CogentaError({
          code: 'CHANNEL_WEBHOOK_DELIVERY_FAILED',
          message: `Webhook delivery to ${url} failed with status ${response.status}.`,
          hint: 'Check that the target URL is reachable and returns a 2xx status for a valid signed request.',
          details: { url, status: response.status },
        }),
      }
    } catch (cause) {
      return {
        url,
        delivered: false,
        status: null,
        error: new CogentaError({
          code: 'CHANNEL_WEBHOOK_DELIVERY_FAILED',
          message: `Webhook delivery to ${url} could not be attempted.`,
          hint: 'The request never completed — check that the host resolves and is reachable from this server.',
          details: { url, cause: String(cause) },
        }),
      }
    }
  }

  return {
    endpoints,
    send: async (event, data) => {
      if (endpoints.length === 0) return []
      const envelope: WebhookEventEnvelope = {
        event,
        occurredAt: new Date(now()).toISOString(),
        data,
      }
      // One body, signed once per endpoint. The signature covers the timestamp,
      // so two endpoints receiving the same event within the same second still
      // get byte-identical headers — which is correct: they are independent
      // receivers, each with its own replay guard.
      const rawBody = JSON.stringify(envelope)
      return Promise.all(endpoints.map((url) => deliverOne(url, rawBody)))
    },
  }
}
