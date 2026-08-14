import { CogentaError } from '@cogenta/core'
import type {
  ChannelAdapter,
  ChannelIdentity,
  ChannelMessage,
  ChannelTarget,
  MessageId,
} from '../../adapter.js'
import { renderWebhookPayload, type WebhookActionLinkOptions } from './render.js'
import {
  signOutgoingWebhook,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from './signing.js'

const CHANNEL_NAME = 'webhook'

export type WebhookFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{
  readonly ok: boolean
  readonly status: number
}>

export interface WebhookAdapterOptions {
  /** Shared secret signing every outbound request — the receiver's `verifyIncomingWebhook` must use the same value. */
  readonly secret: string
  /** Required only if messages with actions (e.g. approvals) are ever sent — see `render.ts`. */
  readonly actionLinks?: WebhookActionLinkOptions
  /** Defaults to the global `fetch`; overridable for tests. */
  readonly fetchImpl?: WebhookFetch
}

/**
 * "Webhook générique signé" (L6 task 11) — the general-purpose "any HTTP
 * endpoint" channel. `target.id` is the receiving URL itself (this is what
 * `ChannelTarget`'s "platform-side identifier" means for a channel whose
 * platform IS arbitrary HTTP): one adapter instance, one shared signing
 * secret, any number of destination URLs.
 *
 * Outbound-only for real command execution: `capabilities.buttons` is
 * `false` (no UI to click, hence the signed-link rendering, same pattern as
 * the email adapter, L6 task 8) and `capabilities.inbound` is `false` —
 * building real inbound COMMAND execution for an arbitrary third-party
 * caller is a materially different, larger undertaking (it would need a
 * real HTTP route wired to a live site, per-integration identity linking
 * decisions, and its own authorization story) than this task's actual,
 * security-critical deliverable: the signing/verification PRIMITIVE
 * (`signing.ts`), which is real, complete, and exercised end-to-end here by
 * `send()`. `verifyIdentity` is an honest refusal, exactly matching the
 * email adapter's precedent, rather than a half-built linking flow with no
 * real inbound transport to carry it.
 */
export function createWebhookAdapter(options: WebhookAdapterOptions): ChannelAdapter {
  const fetchImpl: WebhookFetch = options.fetchImpl ?? (fetch as unknown as WebhookFetch)

  return {
    name: CHANNEL_NAME,
    capabilities: {
      richText: false,
      buttons: false,
      threads: false,
      attachments: false,
      inbound: false,
    },

    async send(target: ChannelTarget, message: ChannelMessage): Promise<MessageId> {
      const payload = renderWebhookPayload(message, options.actionLinks)
      const rawBody = JSON.stringify(payload)
      const signed = signOutgoingWebhook(options.secret, rawBody)

      const response = await fetchImpl(target.id, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [WEBHOOK_TIMESTAMP_HEADER]: signed.timestamp,
          [WEBHOOK_SIGNATURE_HEADER]: signed.signature,
        },
        body: rawBody,
      })

      if (!response.ok) {
        throw new CogentaError({
          code: 'CHANNEL_WEBHOOK_DELIVERY_FAILED',
          message: `Webhook delivery to ${target.id} failed with status ${response.status}.`,
          hint: 'Check that the target URL is reachable and returns a 2xx status for a valid signed request.',
          details: { url: target.id, status: response.status },
        })
      }

      // A generic webhook receiver has no message-id concept of its own to
      // hand back — the timestamp+signature pair is the only real,
      // independently-verifiable identifier this send actually produced.
      return `${signed.timestamp}:${signed.signature}`
    },

    async verifyIdentity(): Promise<ChannelIdentity> {
      throw new CogentaError({
        code: 'CHANNEL_WEBHOOK_INBOUND_UNSUPPORTED',
        message:
          'The generic webhook adapter does not support identity linking — it is outbound-only.',
        hint: 'Link accounts through a channel with capabilities.inbound === true (e.g. Telegram, Slack, Discord).',
      })
    },
  }
}
