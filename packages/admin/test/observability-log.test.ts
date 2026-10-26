import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { describeLog } from '../src/lib/observability-log.js'

const t = ((key: string, options?: Record<string, unknown>) =>
  options === undefined ? key : `${key}:${JSON.stringify(options)}`) as unknown as TFunction

describe('describeLog', () => {
  it('turns the startup "driver selected" line into a sentence with its reason', () => {
    const described = describeLog(
      {
        msg: 'driver selected',
        fields: {
          driver: 'file',
          tier: 'degraded',
          reason: 'redis not available',
          requested: false,
        },
      },
      t,
    )
    expect(described.text).toContain('observability.log.driverSelected')
    expect(described.text).toContain('"driver":"file"')
    expect(described.text).toContain('observability.log.reasonUnavailable')
    expect(described.details).toContainEqual(['reason', 'redis not available'])
  })

  it('shows any other line as written and lists its fields', () => {
    const described = describeLog({ msg: 'something happened', fields: { id: 7 } }, t)
    expect(described.text).toBe('something happened')
    expect(described.details).toEqual([['id', '7']])
  })
})
