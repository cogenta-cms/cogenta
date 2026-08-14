import { CogentaError } from '@cogenta/core'
import type {
  ChannelAdapter,
  ChannelIdentity,
  ChannelMessage,
  ChannelTarget,
  MessageId,
} from '../../adapter.js'
import { type EmailActionLinkOptions, renderEmailMessage } from './render.js'
import type { EmailTransport } from './transport.js'

const CHANNEL_NAME = 'email'

export interface EmailAdapterOptions {
  readonly transport: EmailTransport
  /** Required only if messages with actions (e.g. approvals) are ever sent — see `render.ts`. */
  readonly actionLinks?: EmailActionLinkOptions
}

/**
 * "Adaptateur email" (L6 task 8), outbound-only — the lot's task list names
 * this adapter without the "commandes entrantes" wording task 4 gave
 * Telegram, so no inbound parsing is built: `capabilities.inbound` is
 * `false`, `verifyIdentity`/`onInbound` are honest refusals rather than a
 * half-built reply-to-link-a-channel flow. `buttons` is `false` too — email
 * has none, hence `render.ts`'s signed-link rendering for actions.
 */
export function createEmailAdapter(options: EmailAdapterOptions): ChannelAdapter {
  return {
    name: CHANNEL_NAME,
    capabilities: {
      richText: true,
      buttons: false,
      threads: false,
      attachments: false,
      inbound: false,
    },

    async send(target: ChannelTarget, message: ChannelMessage): Promise<MessageId> {
      const rendered = renderEmailMessage(message, options.actionLinks)
      const sent = await options.transport.send({
        to: target.id,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      })
      return sent.messageId
    },

    async verifyIdentity(): Promise<ChannelIdentity> {
      throw new CogentaError({
        code: 'CHANNEL_EMAIL_INBOUND_UNSUPPORTED',
        message: 'The email adapter does not support identity linking — it is outbound-only.',
        hint: 'Link accounts through a channel with capabilities.inbound === true (e.g. Telegram).',
      })
    },
  }
}
