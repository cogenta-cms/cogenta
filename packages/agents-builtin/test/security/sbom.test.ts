import { describe, expect, it } from 'vitest'
import { buildSbom } from '../../src/security/sbom.js'

describe('buildSbom', () => {
  it('maps a resolved dependency record into SBOM entries, defaulting to npm', () => {
    const sbom = buildSbom({ 'left-pad': '1.3.0', express: '4.18.2' })
    expect(sbom).toEqual(
      expect.arrayContaining([
        { name: 'left-pad', version: '1.3.0', ecosystem: 'npm' },
        { name: 'express', version: '4.18.2', ecosystem: 'npm' },
      ]),
    )
  })

  it('accepts a different ecosystem', () => {
    const sbom = buildSbom({ requests: '2.31.0' }, 'PyPI')
    expect(sbom).toEqual([{ name: 'requests', version: '2.31.0', ecosystem: 'PyPI' }])
  })

  it('returns an empty list for no dependencies', () => {
    expect(buildSbom({})).toEqual([])
  })
})
