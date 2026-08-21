import { describe, expect, it } from 'vitest'
import { classifyBump, higherRiskBump, policyAllows } from '../../src/update/version-compare.js'

describe('classifyBump', () => {
  it('classifies a patch release', () => {
    expect(classifyBump('0.4.0', '0.4.1')).toBe('patch')
  })
  it('classifies a minor release', () => {
    expect(classifyBump('0.4.0', '0.5.0')).toBe('minor')
  })
  it('classifies a major release', () => {
    expect(classifyBump('0.4.0', '1.0.0')).toBe('major')
  })
  it('reports none when already up to date', () => {
    expect(classifyBump('0.4.0', '0.4.0')).toBe('none')
  })
  it('reports none when the target is older', () => {
    expect(classifyBump('0.4.0', '0.3.0')).toBe('none')
  })
  it('reports unknown for an unparseable version', () => {
    expect(classifyBump('not-a-version', '0.4.0')).toBe('unknown')
    expect(classifyBump('0.4.0', 'not-a-version')).toBe('unknown')
  })
})

describe('policyAllows', () => {
  it('off never allows anything', () => {
    expect(policyAllows('off', 'patch')).toBe(false)
    expect(policyAllows('off', 'major')).toBe(false)
  })
  it('patch allows only patch', () => {
    expect(policyAllows('patch', 'patch')).toBe(true)
    expect(policyAllows('patch', 'minor')).toBe(false)
    expect(policyAllows('patch', 'major')).toBe(false)
  })
  it('patch-minor allows patch and minor, not major', () => {
    expect(policyAllows('patch-minor', 'patch')).toBe(true)
    expect(policyAllows('patch-minor', 'minor')).toBe(true)
    expect(policyAllows('patch-minor', 'major')).toBe(false)
  })
  it('patch-minor-major allows everything but none/unknown', () => {
    expect(policyAllows('patch-minor-major', 'patch')).toBe(true)
    expect(policyAllows('patch-minor-major', 'minor')).toBe(true)
    expect(policyAllows('patch-minor-major', 'major')).toBe(true)
  })
})

describe('higherRiskBump', () => {
  it('ranks major over minor over patch over none', () => {
    expect(higherRiskBump('patch', 'major')).toBe('major')
    expect(higherRiskBump('minor', 'patch')).toBe('minor')
    expect(higherRiskBump('none', 'none')).toBe('none')
  })
})
