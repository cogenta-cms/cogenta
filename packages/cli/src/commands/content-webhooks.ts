import { createWebhookEventSender, type WebhookEventSender } from '@cogenta/channels'
import type { CogentaConfig, Logger } from '@cogenta/core'
import type { ContentLifecycleEvent } from '@cogenta/schema'

/**
 * Turns the site's configuration into the one thing `assembleSite` needs: a
 * function that publishes a content lifecycle event to the outside world
 * (L14 task 1).
 *
 * The signed webhook channel has existed since L6 and nothing ever called it.
 * This is the missing half — and deliberately only the wiring: the signature,
 * the headers and the freshness semantics are `@cogenta/channels`'s, unchanged.
 */

export interface ContentWebhookOptions {
  readonly webhooks: CogentaConfig['webhooks']
  /** The site's public base URL, used to turn an entry's path into an absolute URL. */
  readonly siteUrl: string
  readonly logger: Logger
  /** Overridable for tests; defaults to the sender built from `webhooks`. */
  readonly sender?: WebhookEventSender
}

export interface ContentWebhookEmitter {
  /** `null` when the site sends nothing — no endpoint, or no secret. */
  readonly emit: ((event: ContentLifecycleEvent) => Promise<void>) | null
}

/**
 * Both halves are required, and the missing-secret case is a refusal rather
 * than a downgrade: sending a *signed* webhook to nowhere is harmless, but
 * sending an *unsigned* one is an unauthenticated instruction arriving at
 * somebody else's server, which they have no way to tell from an attacker's.
 * A site that configured endpoints without a secret is told so once, at
 * startup, instead of silently never delivering.
 */
export function createContentWebhookEmitter(options: ContentWebhookOptions): ContentWebhookEmitter {
  const { endpoints, secret } = options.webhooks

  if (options.sender === undefined && endpoints.length === 0) return { emit: null }

  if (options.sender === undefined && secret === undefined) {
    options.logger.warn('content webhooks are configured but disabled', {
      endpoints: endpoints.length,
      reason: 'COGENTA_WEBHOOK_SECRET is not set',
    })
    return { emit: null }
  }

  const sender = options.sender ?? createWebhookEventSender({ endpoints, secret: secret ?? '' })

  return {
    emit: async (event) => {
      const { path, ...rest } = event
      const results = await sender.send(event.event, {
        ...rest,
        path,
        // An absolute URL costs the receiver one less thing to know. Built from
        // the same `site.url` the canonical tag and the sitemap already use.
        url: path === null ? null : new URL(path, options.siteUrl).toString(),
      })

      // Structured, and never silent: an outbound side effect that failed is
      // exactly the thing an operator needs in the log, and there is no retry
      // to make it right later (rule R1 — this deployment guarantees no
      // durable worker).
      for (const result of results) {
        if (result.delivered) {
          options.logger.info('content webhook delivered', {
            event: event.event,
            collection: event.collection,
            id: event.id,
            url: result.url,
            status: result.status,
          })
        } else {
          options.logger.error('content webhook delivery failed', {
            event: event.event,
            collection: event.collection,
            id: event.id,
            url: result.url,
            status: result.status,
            error: result.error?.code ?? 'UNKNOWN',
          })
        }
      }
    },
  }
}
