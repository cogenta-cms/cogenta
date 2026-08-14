import { CogentaError } from '@cogenta/core'
import type { NotificationChannelMessage } from '../adapter.js'

/**
 * "Notification — information sans action. Une ligne." The type already
 * has nowhere to put a title or an action; this constructor is what refuses
 * text that isn't actually one line, which the type alone cannot enforce.
 */
export function buildNotification(text: string): NotificationChannelMessage {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    throw new CogentaError({
      code: 'CHANNEL_MESSAGE_INVALID',
      message: 'A notification message cannot be empty.',
      hint: 'Pass a single line of real information, or send nothing at all.',
    })
  }
  if (trimmed.includes('\n')) {
    throw new CogentaError({
      code: 'CHANNEL_MESSAGE_INVALID',
      message: 'A notification message must be a single line.',
      hint: '"Une ligne" is the whole point of this level — split multi-line detail into a Report instead, or trim it to one sentence.',
      details: { lineCount: trimmed.split('\n').length },
    })
  }

  return { level: 'notification', text: trimmed }
}
