import type { ChannelAction, ChannelMessage, ChannelSeverity } from '../../adapter.js'
import type { SlackBlock } from './client.js'

/**
 * "On n'écrit pas de Markdown Telegram dans le code métier" applies just as
 * much to Slack's own Block Kit format — everything platform-specific lives
 * in this module, `ChannelMessage` never knows Block Kit exists.
 */

const SEVERITY_PREFIX: Record<ChannelSeverity, string> = {
  info: ':information_source:',
  warning: ':warning:',
  critical: ':red_circle:',
}

function renderActionsBlock(actions: readonly ChannelAction[] | undefined): SlackBlock | undefined {
  if (actions === undefined || actions.length === 0) return undefined
  return {
    type: 'actions',
    elements: actions.map((action) => ({
      type: 'button',
      text: { type: 'plain_text', text: action.label },
      // `value` is the command text a button press routes as (mirrors
      // Telegram's `callback_data`) — the same `CommandRouter.route()`,
      // never a second, parallel authorization path.
      value: action.id,
      action_id: action.id,
    })),
  }
}

export interface RenderedSlackMessage {
  readonly text: string
  readonly blocks: readonly SlackBlock[]
}

export function renderSlackMessage(message: ChannelMessage): RenderedSlackMessage {
  if (message.level === 'notification') {
    return { text: message.text, blocks: [] }
  }

  if (message.level === 'alert') {
    const prefix = SEVERITY_PREFIX[message.severity]
    const blocks: SlackBlock[] = [
      { type: 'section', text: { type: 'mrkdwn', text: `${prefix} *${message.title}*` } },
      { type: 'section', text: { type: 'mrkdwn', text: message.context } },
      { type: 'section', text: { type: 'mrkdwn', text: `➡️ ${message.expectedAction}` } },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `<${message.adminUrl}|Voir dans l'admin>` },
      },
    ]
    const actionsBlock = renderActionsBlock(message.actions)
    if (actionsBlock !== undefined) blocks.push(actionsBlock)
    return { text: `${prefix} ${message.title}`, blocks }
  }

  // 'report'
  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: message.title } },
  ]
  if (message.keyFigures.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: message.keyFigures.map((figure) => `*${figure.value}* ${figure.label}`).join('   '),
      },
    })
  }
  for (const section of message.sections) {
    const text =
      section.heading === undefined ? section.body : `*${section.heading}*\n${section.body}`
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text } })
  }
  if (message.moreUrl !== undefined) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${message.moreUrl}|Voir le détail>` },
    })
  }
  return { text: message.title, blocks }
}
