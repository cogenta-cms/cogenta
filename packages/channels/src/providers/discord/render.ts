import type { ChannelAction, ChannelMessage, ChannelSeverity } from '../../adapter.js'
import type { DiscordActionRow, DiscordEmbed } from './client.js'

/**
 * "On n'écrit pas de Markdown Telegram dans le code métier" applies just as
 * much to Discord's own embed format — everything platform-specific lives
 * in this module, `ChannelMessage` never knows embeds exist.
 */

const SEVERITY_COLOR: Record<ChannelSeverity, number> = {
  info: 0x5865f2, // Discord blurple
  warning: 0xfaa61a,
  critical: 0xed4245,
}

const SEVERITY_PREFIX: Record<ChannelSeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🔴',
}

function renderActionsRow(
  actions: readonly ChannelAction[] | undefined,
): DiscordActionRow | undefined {
  if (actions === undefined || actions.length === 0) return undefined
  return {
    type: 1,
    components: actions.map((action) => ({
      type: 2,
      style: 1,
      label: action.label,
      // `custom_id` is the command text a component interaction routes as
      // (mirrors Telegram's `callback_data`, Slack's `action_id`/`value`) —
      // the same `CommandRouter.route()`, never a second, parallel
      // authorization path.
      custom_id: action.id,
    })),
  }
}

export interface RenderedDiscordMessage {
  readonly content?: string
  readonly embeds: readonly DiscordEmbed[]
  readonly components: readonly DiscordActionRow[]
}

export function renderDiscordMessage(message: ChannelMessage): RenderedDiscordMessage {
  if (message.level === 'notification') {
    return { content: message.text, embeds: [], components: [] }
  }

  if (message.level === 'alert') {
    const prefix = SEVERITY_PREFIX[message.severity]
    const embed: DiscordEmbed = {
      title: `${prefix} ${message.title}`,
      description: message.context,
      url: message.adminUrl,
      color: SEVERITY_COLOR[message.severity],
      fields: [
        { name: 'Action attendue', value: message.expectedAction },
        { name: 'Admin', value: `[Voir dans l'admin](${message.adminUrl})` },
      ],
    }
    const actionsRow = renderActionsRow(message.actions)
    return { embeds: [embed], components: actionsRow === undefined ? [] : [actionsRow] }
  }

  // 'report'
  const fields = [
    ...message.keyFigures.map((figure) => ({
      name: figure.label,
      value: figure.value,
      inline: true,
    })),
    ...message.sections.map((section) => ({
      name: section.heading ?? 'Détail',
      value: section.body,
    })),
  ]
  const embed: DiscordEmbed = {
    title: message.title,
    ...(fields.length > 0 ? { fields } : {}),
    ...(message.moreUrl === undefined
      ? {}
      : { description: `[Voir le détail](${message.moreUrl})` }),
  }
  return { embeds: [embed], components: [] }
}
