import { CogentaError } from '@cogenta/core'
import type { ChannelAction, ChannelMessage } from '../../adapter.js'
import { buildSignedApprovalLink } from '../../approvals/signed-link.js'

export interface EmailActionLinkOptions {
  /** Where a future verification route lives — no such route is built yet (same gap `signed-link.ts` already documents for every buttonless channel). */
  readonly baseUrl: string
  readonly signingKey: string
  readonly expiresInSeconds: number
}

export interface RenderedEmailMessage {
  readonly subject: string
  readonly text: string
  readonly html: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * `action.id` is command text (`"approve <token>"`/`"deny <token>"`,
 * `approvals/message.ts`) — the same string a button-capable channel routes
 * through `CommandRouter`. Email has no buttons ("## Approbations depuis le
 * canal": "Sur un canal sans boutons [...] l'action est un lien signé à
 * usage unique."), so it turns that same command text into the equivalent
 * signed link instead of inventing a parallel action representation.
 * Approve/deny is the only action shape any real producer emits today
 * (`dispatchApproval`) — anything else is refused rather than guessed at.
 */
function actionToLink(action: ChannelAction, links: EmailActionLinkOptions): string {
  const match = /^(approve|deny)\s+(.+)$/.exec(action.id)
  if (match === null) {
    throw new CogentaError({
      code: 'CHANNEL_EMAIL_TRANSPORT_ERROR',
      message: `Email cannot render the action "${action.id}" as a signed link — its id is not in the "approve <token>"/"deny <token>" shape every real producer emits.`,
      hint: 'Only approval actions (dispatchApproval) are rendered by this adapter today.',
      details: { actionId: action.id },
    })
  }
  const [, word = '', token = ''] = match
  const decision = word === 'approve' ? 'approved' : 'rejected'
  return buildSignedApprovalLink(
    links.baseUrl,
    links.signingKey,
    token,
    decision,
    links.expiresInSeconds,
  )
}

function renderActions(
  actions: readonly ChannelAction[] | undefined,
  links: EmailActionLinkOptions | undefined,
): { text: string; html: string } {
  if (actions === undefined || actions.length === 0) return { text: '', html: '' }
  if (links === undefined) {
    throw new CogentaError({
      code: 'CHANNEL_EMAIL_TRANSPORT_ERROR',
      message:
        'This message carries actions but the email adapter was not configured with actionLinks.',
      hint: 'Pass { actionLinks: { baseUrl, signingKey, expiresInSeconds } } to createEmailAdapter.',
    })
  }
  const rows = actions.map((action) => ({ label: action.label, url: actionToLink(action, links) }))
  const text = `\n\n${rows.map((row) => `${row.label} : ${row.url}`).join('\n')}`
  const html = `<p>${rows.map((row) => `<a href="${escapeHtml(row.url)}">${escapeHtml(row.label)}</a>`).join(' &nbsp;|&nbsp; ')}</p>`
  return { text, html }
}

/**
 * Fresh, email-native rendering — the "on n'écrit pas de Markdown Telegram
 * dans le code métier" boundary (L6, `## Interface`) cuts both ways: nothing
 * from `providers/telegram/render.ts` is reused here, and nothing here leaks
 * into `ChannelMessage` itself.
 */
export function renderEmailMessage(
  message: ChannelMessage,
  actionLinks?: EmailActionLinkOptions,
): RenderedEmailMessage {
  if (message.level === 'alert') {
    const actions = renderActions(message.actions, actionLinks)
    const severityLabel = message.severity.toUpperCase()
    return {
      subject: `[${severityLabel}] ${message.title}`,
      text: `${message.context}\n\nAction attendue : ${message.expectedAction}\n\nAdmin : ${message.adminUrl}${actions.text}`,
      html:
        `<p><strong>${escapeHtml(message.context)}</strong></p>` +
        `<p>Action attendue : ${escapeHtml(message.expectedAction)}</p>` +
        `<p><a href="${escapeHtml(message.adminUrl)}">Voir dans l'admin</a></p>${actions.html}`,
    }
  }

  if (message.level === 'report') {
    const figures = message.keyFigures.map((figure) => `${figure.label} : ${figure.value}`)
    const sections = message.sections.map((section) =>
      section.heading === undefined ? section.body : `${section.heading}\n${section.body}`,
    )
    const moreLine = message.moreUrl === undefined ? '' : `\n\nVoir plus : ${message.moreUrl}`
    return {
      subject: message.title,
      text: `${figures.join(' · ')}\n\n${sections.join('\n\n')}${moreLine}`,
      html:
        `<p>${figures.map(escapeHtml).join(' &middot; ')}</p>` +
        message.sections
          .map(
            (section) =>
              `<div>${section.heading === undefined ? '' : `<h3>${escapeHtml(section.heading)}</h3>`}<p>${escapeHtml(section.body)}</p></div>`,
          )
          .join('') +
        (message.moreUrl === undefined
          ? ''
          : `<p><a href="${escapeHtml(message.moreUrl)}">Voir plus</a></p>`),
    }
  }

  return {
    subject: message.text,
    text: message.text,
    html: `<p>${escapeHtml(message.text)}</p>`,
  }
}
