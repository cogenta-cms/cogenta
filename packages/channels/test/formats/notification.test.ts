import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { buildNotification } from '../../src/formats/notification.js'

describe('buildNotification', () => {
  it('builds a real NotificationChannelMessage from one line of text', () => {
    const message = buildNotification('Le site a été republié.')
    expect(message).toEqual({ level: 'notification', text: 'Le site a été republié.' })
  })

  it('trims surrounding whitespace', () => {
    const message = buildNotification('  Terminé.  ')
    expect(message.text).toBe('Terminé.')
  })

  it('rejects empty text', () => {
    expect(() => buildNotification('   ')).toThrow(CogentaError)
  })

  it('rejects multi-line text — "une ligne" is the whole point', () => {
    expect(() => buildNotification('Ligne un.\nLigne deux.')).toThrow(CogentaError)
  })
})
