import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { buildAlert } from '../../src/formats/alert.js'

function validInput() {
  return {
    title: 'Scan de dépendances',
    severity: 'warning' as const,
    context: 'Une dépendance vulnérable a été trouvée.',
    expectedAction: 'Approuver la mise à jour.',
    adminUrl: 'https://admin.example/deps/1',
  }
}

describe('buildAlert', () => {
  it('builds a real AlertChannelMessage from valid input', () => {
    const message = buildAlert(validInput())
    expect(message).toEqual({ level: 'alert', ...validInput() })
  })

  it('keeps optional actions when provided', () => {
    const actions = [{ id: 'approve X', label: 'Approuver' }]
    const message = buildAlert({ ...validInput(), actions })
    expect(message.actions).toEqual(actions)
  })

  it.each(['title', 'context', 'expectedAction'] as const)('rejects an empty "%s"', (field) => {
    expect(() => buildAlert({ ...validInput(), [field]: '   ' })).toThrow(CogentaError)
  })

  it('rejects an adminUrl that is not a real URL', () => {
    expect(() => buildAlert({ ...validInput(), adminUrl: 'not-a-url' })).toThrow(CogentaError)
  })

  it('carries a stable, actionable error code', () => {
    try {
      buildAlert({ ...validInput(), title: '' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('CHANNEL_MESSAGE_INVALID')
      expect((error as CogentaError).hint).toBeDefined()
    }
  })
})
