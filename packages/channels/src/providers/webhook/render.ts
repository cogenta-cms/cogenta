import type { ChannelAction, ChannelMessage } from '../../adapter.js'
import { buildSignedApprovalLink } from '../../approvals/signed-link.js'
import { type EmailActionLinkOptions, renderEmailMessage } from '../email/render.js'

export interface WebhookActionLinkOptions extends EmailActionLinkOptions {}

export interface WebhookPayload {
  readonly level: ChannelMessage['level']
  readonly title: string
  readonly text: string
  readonly actions?: readonly { readonly label: string; readonly url: string }[]
}

/**
 * `action.id` is command text (`"approve <token>"`/`"deny <token>"`, the
 * same shape `email/render.ts`'s `actionToLink` already parses) — mirrored
 * here rather than imported, since that helper is private to its own
 * module; both wrap the one real primitive, `buildSignedApprovalLink`.
 */
function actionToUrl(action: ChannelAction, links: WebhookActionLinkOptions): string {
  const match = /^(approve|deny)\s+(.+)$/.exec(action.id)
  const [, word = 'approve', token = action.id] = match ?? []
  const decision = word === 'approve' ? 'approved' : 'rejected'
  return buildSignedApprovalLink(
    links.baseUrl,
    links.signingKey,
    token,
    decision,
    links.expiresInSeconds,
  )
}

/**
 * A generic webhook receiver has no rendering surface of its own (no
 * Markdown dialect, no Block Kit) — the payload is plain, structured JSON.
 * Actions still can't be buttons ("## Approbations depuis le canal": "Sur un
 * canal sans boutons [...] l'action est un lien signé à usage unique"), so
 * this reuses `email/render.ts`'s real validation (it already throws
 * `CHANNEL_EMAIL_TRANSPORT_ERROR` for an unrenderable action or a missing
 * `actionLinks` config — that check is not duplicated here) for its plain
 * text and only rebuilds the action *links* locally, since the payload shape
 * (label/url pairs) differs from email's HTML anchor rendering.
 */
export function renderWebhookPayload(
  message: ChannelMessage,
  actionLinks?: WebhookActionLinkOptions,
): WebhookPayload {
  const rendered = renderEmailMessage(message, actionLinks)
  const actions =
    message.level === 'alert' && message.actions !== undefined && message.actions.length > 0
      ? message.actions.map((action) => ({
          label: action.label,
          url: actionToUrl(action, actionLinks as WebhookActionLinkOptions),
        }))
      : undefined

  return {
    level: message.level,
    title: rendered.subject,
    text: rendered.text,
    ...(actions === undefined ? {} : { actions }),
  }
}
