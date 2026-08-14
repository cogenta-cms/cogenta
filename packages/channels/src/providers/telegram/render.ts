import type { ChannelAction, ChannelMessage, ChannelSeverity } from '../../adapter.js'
import type { TelegramInlineButton, TelegramReplyMarkup } from './client.js'

/**
 * "On n'écrit pas de Markdown Telegram dans le code métier." All
 * Telegram-specific rendering lives here, entirely inside this adapter —
 * `ChannelMessage` itself never knows Telegram's escaping rules exist.
 */

// Telegram's MarkdownV2 requires escaping these characters outside of an
// entity (https://core.telegram.org/bots/api#markdownv2-style).
const MARKDOWN_V2_SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g

export function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWN_V2_SPECIAL, (char) => `\\${char}`)
}

const SEVERITY_PREFIX: Record<ChannelSeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🔴',
}

function renderActions(
  actions: readonly ChannelAction[] | undefined,
): TelegramReplyMarkup | undefined {
  if (actions === undefined || actions.length === 0) return undefined
  const buttons: TelegramInlineButton[] = actions.map((action) => ({
    text: action.label,
    // The callback_data IS the command text a button press routes as —
    // reusing the exact same `CommandRouter.route()` a typed command goes
    // through, never a second, parallel authorization path.
    callback_data: action.id,
  }))
  return { inline_keyboard: [buttons] }
}

export interface RenderedTelegramMessage {
  readonly text: string
  readonly replyMarkup?: TelegramReplyMarkup
}

/**
 * Renders one of the lot's three fixed message levels into Telegram
 * MarkdownV2 text plus (for an alert with actions) inline buttons. Every
 * piece of user-authored text is escaped; only the structural markup this
 * function itself adds (bold, bullets) is left unescaped.
 */
export function renderTelegramMessage(message: ChannelMessage): RenderedTelegramMessage {
  if (message.level === 'notification') {
    // "Information sans action. Une ligne."
    return { text: escapeMarkdownV2(message.text) }
  }

  if (message.level === 'alert') {
    const prefix = SEVERITY_PREFIX[message.severity]
    const lines = [
      `${prefix} *${escapeMarkdownV2(message.title)}*`,
      escapeMarkdownV2(message.context),
      `➡️ ${escapeMarkdownV2(message.expectedAction)}`,
      `[${escapeMarkdownV2('Voir dans l’admin')}](${message.adminUrl})`,
    ]
    const replyMarkup = renderActions(message.actions)
    return { text: lines.join('\n\n'), ...(replyMarkup === undefined ? {} : { replyMarkup }) }
  }

  // 'report' — "Chiffres clés en tête, détail ensuite, jamais plus d'un
  // écran sans repli."
  const lines = [`*${escapeMarkdownV2(message.title)}*`]
  if (message.keyFigures.length > 0) {
    lines.push(
      message.keyFigures
        .map((figure) => `*${escapeMarkdownV2(figure.value)}* ${escapeMarkdownV2(figure.label)}`)
        .join('  ·  '),
    )
  }
  for (const section of message.sections) {
    const heading = section.heading === undefined ? '' : `*${escapeMarkdownV2(section.heading)}*\n`
    lines.push(`${heading}${escapeMarkdownV2(section.body)}`)
  }
  if (message.moreUrl !== undefined) {
    lines.push(`[${escapeMarkdownV2('Voir le détail')}](${message.moreUrl})`)
  }
  return { text: lines.join('\n\n') }
}
