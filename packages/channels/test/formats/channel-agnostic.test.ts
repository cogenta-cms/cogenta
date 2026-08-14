import { describe, expect, it } from 'vitest'
import { buildAlert } from '../../src/formats/alert.js'
import { buildNotification } from '../../src/formats/notification.js'
import { buildReport } from '../../src/formats/report.js'

/**
 * "Le même événement rendu sur Telegram, Slack et email reste lisible et
 * cohérent" (critère d'acceptation) presumes `ChannelMessage` construction
 * never leaks a channel-specific concept — no adapter exists to test
 * cross-rendering against yet (Slack/email are later tasks), but this shape
 * property is checkable today and must hold before any of them are built.
 */
const TELEGRAM_ONLY_KEYS = [
  'parse_mode',
  'callback_data',
  'chat_id',
  'reply_markup',
  'inline_keyboard',
]

function hasNoTelegramKeys(message: object): boolean {
  return Object.keys(message).every((key) => !TELEGRAM_ONLY_KEYS.includes(key))
}

describe('ChannelMessage construction is channel-agnostic', () => {
  it('an Alert carries no Telegram-specific keys or MarkdownV2 escaping', () => {
    const message = buildAlert({
      title: 'Titre *avec* [markdown]',
      severity: 'info',
      context: 'Contexte.',
      expectedAction: 'Action.',
      adminUrl: 'https://admin.example',
    })
    expect(hasNoTelegramKeys(message)).toBe(true)
    // The abstract type stores raw text; escaping is the adapter's job, not the constructor's.
    expect(message.title).toBe('Titre *avec* [markdown]')
  })

  it('a Report carries no Telegram-specific keys', () => {
    const message = buildReport({
      title: 'Rapport',
      keyFigures: [{ label: 'x', value: '1' }],
      sections: [{ body: 'Détail.' }],
    })
    expect(hasNoTelegramKeys(message)).toBe(true)
  })

  it('a Notification carries no Telegram-specific keys', () => {
    const message = buildNotification('Terminé.')
    expect(hasNoTelegramKeys(message)).toBe(true)
  })
})
